// script.js — Modal gallery & swipe navigation
document.addEventListener('DOMContentLoaded', () => {
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
	

	if (shareBtn) {
		shareBtn.addEventListener('click', async () => {
			const shareData = {
				title: modalTitle.textContent || 'Check this out!',
				text: 'Found this interesting post, take a look 👇',
				url: window.location.href, // fallback if image cannot be shared
			};

			// If browser supports Web Share API
			if (navigator.share) {
				try {
					await navigator.share(shareData);
					console.log('Post shared successfully!');
				} catch (err) {
					console.error('Share failed:', err);
				}
			} else {
				// Fallback: Copy image link to clipboard
				const imgUrl = modalImage.src;
				navigator.clipboard.writeText(imgUrl).then(() => {
					alert('Image link copied to clipboard ✅');
				});
			}
		});
	}

	// Build gallery from DOM elements that include data-index
	const pinEls = Array.from(document.querySelectorAll('[data-index]'));
	const gallery = pinEls.map((el) => ({
		image: el.dataset.image,
		title: el.dataset.title || '',
		desc: el.dataset.desc || '',
		authorFullname: el.dataset.authorFullname || 'Unknown',
		authorUsername: el.dataset.authorUsername || '',
		authorImage: el.dataset.authorImage
			? `${el.dataset.authorImage}`
			: '/images/defaultpic.png',
		el,
	}));

	let currentIndex = 0;
	let rotating = 0; // rotation state (0..3)
	let lastWheelAt = 0;
	let lastSwipeAt = 0;

	// Helpers
	function showModal(index) {
		if (!gallery.length) return;
		currentIndex = Math.max(0, Math.min(index, gallery.length - 1));
		populateModal(gallery[currentIndex]);
		modal.classList.add('show');
		document.body.classList.add('overflow-hidden');
		// focus on modal (accessibility)
		panel.setAttribute('tabindex', '-1');
		panel.focus();
	}

	function closeModal() {
		modal.classList.remove('show');
		document.body.classList.remove('overflow-hidden');
		rotating = 0;
		modalImage.style.transform = '';
	}

	function populateModal(item) {
		// animate image swap
		modalImage.classList.add('modal-image-transition');
		modalImage.style.opacity = '0';
		setTimeout(() => {
			modalImage.src = item.image || '';
			modalImage.alt = item.title || '';
			modalTitle.textContent = item.title || '';
			modalDesc.textContent = item.desc || '';
			modalAuthorImg.src = item.authorImage || '/images/uploads/defaultpic.jpg';
			modalAuthorName.textContent = item.authorFullname || 'Unknown';
			modalAuthorUsername.textContent = item.authorUsername
				? `@${item.authorUsername}`
				: '';
			likeCountEl.textContent = item.likes || 0;
			commentCountEl.textContent = item.comments || 0;
			rotating = 0;
			modalImage.style.transform = '';
			modalImage.style.opacity = '1';
			// optional: preload adjacent images
			preloadIndex(currentIndex - 1);
			preloadIndex(currentIndex + 1);
			setTimeout(
				() => modalImage.classList.remove('modal-image-transition'),
				260,
			);
		}, 120);
	}

	function preloadIndex(i) {
		if (i < 0 || i >= gallery.length) return;
		const img = new Image();
		img.src = gallery[i].image;
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

	// Click handlers to open modal
	pinEls.forEach((pEl, idx) => {
		pEl.addEventListener('click', (e) => {
			e.preventDefault();
			showModal(Number(pEl.dataset.index || idx));
		});
	});

	// Close by backdrop or close button
	backdrop.addEventListener('click', closeModal);
	closeBtn.addEventListener('click', closeModal);

	// Expand (open in new tab)
	if (expandBtn)
		expandBtn.addEventListener('click', () => {
			if (modalImage.src) window.open(modalImage.src, '_blank');
		});

	// Rotate
	if (rotateBtn)
		rotateBtn.addEventListener('click', () => {
			rotating = (rotating + 1) % 4;
			const deg = rotating * 90;
			modalImage.style.transform = `rotate(${deg}deg)`;
		});

	// Thumbnail clicks (more-thumb)
	document.querySelectorAll('.more-thumb').forEach((thumb) => {
		thumb.addEventListener('click', () => {
			const url =
				thumb.dataset.thumbImage || thumb.src || thumb.getAttribute('src');
			const idx = gallery.findIndex((g) => g.image === url);
			if (idx >= 0) {
				currentIndex = idx;
				populateModal(gallery[currentIndex]);
				// on mobile, ensure modal is open
				modal.classList.add('show');
				document.body.classList.add('overflow-hidden');
			} else {
				// fallback: just replace src
				modalImage.src = url;
			}
		});
	});

	// Keyboard navigation
	window.addEventListener('keydown', (ev) => {
		if (!modal.classList.contains('show')) return;
		if (ev.key === 'ArrowRight') {
			nextImage();
			ev.preventDefault();
		}
		if (ev.key === 'ArrowLeft') {
			prevImage();
			ev.preventDefault();
		}
		if (ev.key === 'Escape') {
			closeModal();
		}
	});

	// Wheel navigation (only when pointer is over image area)
	imageWrap.addEventListener(
		'wheel',
		(ev) => {
			const now = Date.now();
			if (now - lastWheelAt < 400) return; // throttle
			const delta = ev.deltaY;
			// if user scrolls strongly vertically on image area, treat as next/prev
			if (Math.abs(delta) > 30) {
				if (delta > 0) nextImage();
				else prevImage();
				lastWheelAt = now;
				ev.preventDefault();
			}
		},
		{ passive: false },
	);

	// Touch swipe detection (on imageWrap only)
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
			const now = Date.now();
			if (now - lastSwipeAt < 250) return;
			// horizontal dominant swipe
			if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
				if (dx < 0) nextImage();
				else prevImage();
				lastSwipeAt = now;
			}
		},
		{ passive: true },
	);

	// Desktop: allow left/right click areas on image to navigate
	imageWrap.addEventListener('click', (e) => {
		// only if click on empty space or image; don't trigger when clicking controls
		const rect = imageWrap.getBoundingClientRect();
		const x = e.clientX - rect.left;
		if (x < rect.width * 0.35) prevImage();
		else if (x > rect.width * 0.65) nextImage();
	});

	// Accessibility: trap focus in modal while open (simple)
	document.addEventListener(
		'focus',
		(ev) => {
			if (!modal.classList.contains('show')) return;
			if (!panel.contains(ev.target)) {
				ev.stopPropagation();
				panel.focus();
			}
		},
		true,
	);

	// Prevent right-panel scroll from blocking full modal on small screens:
	// nothing needed here because right panel remains scrollable; touch swipe only attached on imageWrap.

	// Optional: make thumbnails swipable by touch (native scroll already does it)

	// Clean up when page unloads
	window.addEventListener('beforeunload', () => {
		document.body.classList.remove('overflow-hidden');
	});
});
