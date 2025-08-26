(() => {
	// tiny helper: use existing toast if present, otherwise fallback to alert
	const toast = (msg) => {
		if (typeof window.toast === 'function') return window.toast(msg);
		const el = document.getElementById('toast');
		if (el) {
			el.textContent = msg;
			el.classList.remove('hidden');
			clearTimeout(el._t);
			el._t = setTimeout(() => el.classList.add('hidden'), 1600);
			return;
		}
		// absolute fallback
		try {
			console.log(msg);
		} catch (e) {}
	};

	// constants / thresholds
	const WHEEL_THROTTLE_MS = 400;
	const SWIPE_THROTTLE_MS = 250;
	const SWIPE_MIN_DISTANCE = 40;
	const WHEEL_MIN_DELTA = 30;
	const IMAGE_TRANSITION_MS = 260;

	// state
	let gallery = [];
	let currentIndex = 0;
	let rotateState = 0; // 0..3
	let lastWheelAt = 0;
	let lastSwipeAt = 0;

	function init() {
		// cache main modal nodes (may be null if missing)
		const modal = document.getElementById('imageModal');
		const backdrop = document.getElementById('modalBackdrop');
		const panel = document.getElementById('modalPanel');
		const imageWrap = document.getElementById('modalImageWrap');
		const modalImage = document.getElementById('modalImage');
		const modalTitle = document.getElementById('modalTitle');
		const modalDesc = document.getElementById('modalDesc');
		const modalAuthorImg = document.getElementById('modalAuthorImg');
		const modalAuthorName = document.getElementById('modalAuthorName');
		const modalAuthorUsername = document.getElementById('modalAuthorUsername');
		const likeCountEl = document.getElementById('likeCount');
		const commentCountEl = document.getElementById('commentCount');
		const closeBtn = document.getElementById('closeModalBtn');
		const expandBtn = document.getElementById('expandBtn');
		const rotateBtn = document.getElementById('rotateBtn');
		const shareBtn = document.getElementById('shareBtn');

		// stop if modal root missing — safe exit
		if (!modal || !panel || !imageWrap || !modalImage) return;

		// Build gallery from DOM nodes with data-index OR data-image (delegated open)
		const pinEls = Array.from(
			document.querySelectorAll('[data-index], [data-image]'),
		);
		gallery = pinEls.map((el, i) => ({
			image: el.dataset.image || el.getAttribute('src') || '',
			title: el.dataset.title || '',
			desc: el.dataset.desc || '',
			authorFullname: el.dataset.authorFullname || 'Unknown',
			authorUsername: el.dataset.authorUsername || '',
			authorImage: el.dataset.authorImage || '/images/defaultpic.png',
			origEl: el,
			index:
				typeof el.dataset.index !== 'undefined' ? Number(el.dataset.index) : i,
			likes: el.dataset.likes ? Number(el.dataset.likes) : 0,
			comments: el.dataset.comments ? Number(el.dataset.comments) : 0,
		}));

		// helper: safe attr set
		const safeText = (el, text) => {
			if (!el) return;
			el.textContent = text ?? '';
		};

		// populate modal from gallery item (with cross-fade)
		function populateModal(item) {
			if (!item) return;
			// small CSS-driven transition: toggle class, use rAF to avoid layout flicker
			modalImage.classList.add('modal-image-transition');
			modalImage.style.opacity = '0';

			// small delay to allow transition class + opacity to take effect
			setTimeout(() => {
				// swap content
				modalImage.src = item.image || '';
				modalImage.alt = item.title || '';
				safeText(modalTitle, item.title || '');
				safeText(modalDesc, item.desc || '');
				if (modalAuthorImg)
					modalAuthorImg.src = item.authorImage || '/images/defaultpic.png';
				safeText(modalAuthorName, item.authorFullname || 'Unknown');
				safeText(
					modalAuthorUsername,
					item.authorUsername ? `@${item.authorUsername}` : '',
				);
				if (likeCountEl) likeCountEl.textContent = String(item.likes || 0);
				if (commentCountEl)
					commentCountEl.textContent = String(item.comments || 0);

				rotateState = 0;
				modalImage.style.transform = '';
				// fade back in next frame
				requestAnimationFrame(() => {
					modalImage.style.opacity = '1';
				});

				// preload neighbors
				preloadIndex(currentIndex - 1);
				preloadIndex(currentIndex + 1);

				// cleanup transition class after duration
				setTimeout(
					() => modalImage.classList.remove('modal-image-transition'),
					IMAGE_TRANSITION_MS,
				);
			}, 80);
		}

		function preloadIndex(i) {
			if (i < 0 || i >= gallery.length) return;
			const url = gallery[i].image;
			if (!url) return;
			const img = new Image();
			img.src = url;
		}

		function openModal(index) {
			if (!gallery.length) return;
			currentIndex = Math.max(0, Math.min(index, gallery.length - 1));
			populateModal(gallery[currentIndex]);
			modal.classList.add('show');
			document.body.classList.add('overflow-hidden');
			panel.setAttribute('tabindex', '-1');
			panel.focus();
		}

		function closeModal() {
			modal.classList.remove('show');
			document.body.classList.remove('overflow-hidden');
			rotateState = 0;
			modalImage.style.transform = '';
		}

		function nextImage() {
			if (currentIndex >= gallery.length - 1) return;
			currentIndex++;
			populateModal(gallery[currentIndex]);
		}
		function prevImage() {
			if (currentIndex <= 0) return;
			currentIndex--;
			populateModal(gallery[currentIndex]);
		}

		// delegated opening: clicks on elements with data-index or data-image
		document.addEventListener('click', (ev) => {
			const el =
				ev.target.closest && ev.target.closest('[data-index], [data-image]');
			if (!el) return;

			// prevent if the click was on a control inside the element
			// allow normal links to proceed if they have href and user intent (but we assume modal should open)
			ev.preventDefault();
			const idxAttr = el.dataset.index;
			const index =
				typeof idxAttr !== 'undefined' && idxAttr !== ''
					? Number(idxAttr)
					: gallery.findIndex((g) => g.origEl === el);
			openModal(Number.isFinite(index) && index >= 0 ? index : 0);
		});

		// close handlers
		if (backdrop) backdrop.addEventListener('click', closeModal);
		if (closeBtn) closeBtn.addEventListener('click', closeModal);

		// expand: open raw image in new tab
		if (expandBtn)
			expandBtn.addEventListener('click', () => {
				if (modalImage.src) window.open(modalImage.src, '_blank');
			});

		// rotate button
		if (rotateBtn)
			rotateBtn.addEventListener('click', () => {
				rotateState = (rotateState + 1) % 4;
				const deg = rotateState * 90;
				modalImage.style.transform = `rotate(${deg}deg)`;
			});

		// thumbnail shortcut clicks (.more-thumb) handled with delegation too:
		document.addEventListener('click', (ev) => {
			const thumb = ev.target.closest && ev.target.closest('.more-thumb');
			if (!thumb) return;
			ev.preventDefault();
			const url =
				thumb.dataset.thumbImage || thumb.src || thumb.getAttribute('src');
			const idx = gallery.findIndex((g) => g.image === url);
			if (idx >= 0) {
				currentIndex = idx;
				populateModal(gallery[currentIndex]);
				modal.classList.add('show');
				document.body.classList.add('overflow-hidden');
			} else if (modalImage) {
				modalImage.src = url;
			}
		});

		// keyboard navigation (when modal open)
		window.addEventListener('keydown', (ev) => {
			if (!modal.classList.contains('show')) return;
			if (ev.key === 'ArrowRight') {
				nextImage();
				ev.preventDefault();
			} else if (ev.key === 'ArrowLeft') {
				prevImage();
				ev.preventDefault();
			} else if (ev.key === 'Escape') {
				closeModal();
			}
		});

		// wheel navigation (throttled while pointer in imageWrap)
		let wheelHandler = (ev) => {
			const nowTs = Date.now();
			if (nowTs - lastWheelAt < WHEEL_THROTTLE_MS) return;
			const delta = ev.deltaY;
			if (Math.abs(delta) > WHEEL_MIN_DELTA) {
				if (delta > 0) nextImage();
				else prevImage();
				lastWheelAt = nowTs;
				ev.preventDefault();
			}
		};
		imageWrap.addEventListener('wheel', wheelHandler, { passive: false });

		// touch swipe detection (start/end only, throttled)
		let touchStartX = 0,
			touchStartY = 0;
		imageWrap.addEventListener(
			'touchstart',
			(e) => {
				if (e.touches.length > 1) return;
				touchStartX = e.touches[0].clientX;
				touchStartY = e.touches[0].clientY;
			},
			{ passive: true },
		);

		imageWrap.addEventListener(
			'touchend',
			(e) => {
				if (!e.changedTouches || e.changedTouches.length === 0) return;
				const dx = e.changedTouches[0].clientX - touchStartX;
				const dy = e.changedTouches[0].clientY - touchStartY;
				const nowTs = Date.now();
				if (nowTs - lastSwipeAt < SWIPE_THROTTLE_MS) return;
				if (Math.abs(dx) > SWIPE_MIN_DISTANCE && Math.abs(dx) > Math.abs(dy)) {
					if (dx < 0) nextImage();
					else prevImage();
					lastSwipeAt = nowTs;
				}
			},
			{ passive: true },
		);

		// desktop click-area nav (left / right thirds)
		imageWrap.addEventListener('click', (e) => {
			// avoid clicks on controls (e.g. buttons inside imageWrap)
			const rect = imageWrap.getBoundingClientRect();
			const x = e.clientX - rect.left;
			if (x < rect.width * 0.35) prevImage();
			else if (x > rect.width * 0.65) nextImage();
		});

		// simple focus trap: keep focus inside panel while modal open
		document.addEventListener('focusin', (ev) => {
			if (!modal.classList.contains('show')) return;
			if (!panel.contains(ev.target)) panel.focus();
		});

		// share handling: Web Share API when available, fallback to clipboard
		if (shareBtn) {
			shareBtn.addEventListener('click', async (ev) => {
				ev.stopPropagation();
				const shareData = {
					title: modalTitle.textContent || 'Check this out!',
					text: modalDesc.textContent || '',
					url: modalImage.src || window.location.href,
				};
				try {
					if (navigator.share) {
						await navigator.share(shareData);
					} else {
						await navigator.clipboard.writeText(shareData.url);
						toast('Image link copied to clipboard');
					}
				} catch (err) {
					// graceful fallback
					try {
						await navigator.clipboard.writeText(shareData.url);
						toast('Image link copied');
					} catch (e) {
						toast('Could not share');
					}
				}
			});
		}

		// cleanup on unload
		window.addEventListener('beforeunload', () => {
			document.body.classList.remove('overflow-hidden');
		});
	}

	// init when DOM ready (safe and consistent)
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init);
	} else {
		init();
	}
})();
