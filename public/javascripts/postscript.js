(() => {
	// utilities
	const $ = (sel, root = document) => root.querySelector(sel);
	const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
	const noop = () => {};
	const now = () => Date.now();

	// TOAST
	const toastEl = document.getElementById('toast');
	const toast = (msg, ms = 1600) => {
		if (!toastEl) return;
		toastEl.textContent = msg;
		toastEl.classList.remove('hidden');
		clearTimeout(toastEl._t);
		toastEl._t = setTimeout(() => toastEl.classList.add('hidden'), ms);
	};

	// --------- LIKES (delegated) ---------
	const pendingLikes = new Map(); // postId -> abort controller or timestamp

	function postLikeRequest(postId) {
		if (!postId) return Promise.reject(new Error('no-id'));
		// prevent duplicate requests for same id for short period
		if (pendingLikes.has(postId)) return Promise.reject(new Error('pending'));

		const controller = new AbortController();
		pendingLikes.set(postId, controller);
		return fetch(`/posts/${encodeURIComponent(postId)}/like`, {
			method: 'POST',
			credentials: 'same-origin',
			headers: { 'X-Requested-With': 'XMLHttpRequest' },
			signal: controller.signal,
		}).finally(() => pendingLikes.delete(postId));
	}

	function setLikeUI(btn, liked, likesCount) {
		if (!btn) return;
		btn.setAttribute('aria-pressed', liked ? 'true' : 'false');
		btn.classList.toggle('liked', !!liked);
		const heartLine = btn.querySelector('.ri-heart-line');
		const heartFill = btn.querySelector('.ri-heart-fill');
		if (heartLine) heartLine.classList.toggle('hidden', liked);
		if (heartFill) heartFill.classList.toggle('hidden', !liked);
		const id = (btn.dataset.postId || btn.id || '').replace(/^likeBtn-/, '');
		if (id && typeof likesCount !== 'undefined') {
			const cs = document.getElementById('likeCount-' + id);
			if (cs) cs.textContent = String(likesCount);
		}
	}

	async function handleLikeAction(btn) {
		if (!btn || btn.disabled) return;
		const postId = btn.dataset.postId || btn.id.replace(/^likeBtn-/, '');
		if (!postId) return;

		const wasLiked = btn.getAttribute('aria-pressed') === 'true';
		const countEl = document.getElementById('likeCount-' + postId);
		const prevCount = countEl ? Number(countEl.textContent || 0) : 0;

		const optimistic = wasLiked ? Math.max(0, prevCount - 1) : prevCount + 1;
		setLikeUI(btn, !wasLiked, optimistic);

		btn.disabled = true;

		try {
			const res = await postLikeRequest(postId);
			if (res.status === 401) {
				setLikeUI(btn, wasLiked, prevCount);
				toast('Login required to like posts');
				return;
			}
			const ct = (res.headers.get('content-type') || '').toLowerCase();
			if (!res.ok || !ct.includes('application/json')) {
				setLikeUI(btn, wasLiked, prevCount);
				toast('Could not update like. Try again.');
				console.error('Unexpected like response', res.status);
				return;
			}
			const data = await res.json().catch(() => null);
			if (!data || !data.success) {
				setLikeUI(btn, wasLiked, prevCount);
				toast(data?.error || 'Failed to update like');
				return;
			}
			const serverLiked = !!data.liked;
			const serverCount =
				typeof data.likesCount === 'number' ? data.likesCount : optimistic;
			setLikeUI(btn, serverLiked, serverCount);
		} catch (err) {
			if (err.name === 'AbortError') {
				// intentionally aborted, do nothing
			} else if (err.message === 'pending') {
				// ignore duplicates
			} else {
				console.error('Network error while toggling like:', err);
				setLikeUI(btn, wasLiked, prevCount);
				toast('Network error');
			}
		} finally {
			btn.disabled = false;
		}
	}

	// delegated click for like buttons (handles dynamic buttons)
	document.addEventListener('click', (ev) => {
		const btn = ev.target.closest('[id^="likeBtn-"], [data-like-button]');
		if (!btn) return;
		ev.preventDefault();
		handleLikeAction(btn);
	});

	// expose toggleLike for compatibility
	window.toggleLike = async function toggleLike(postIdArg) {
		const id =
			postIdArg || document.querySelector('main[data-post-id]')?.dataset.postId;
		if (!id) return;
		try {
			const res = await fetch(`/posts/${id}/like`, {
				method: 'POST',
				credentials: 'same-origin',
				headers: { 'X-Requested-With': 'XMLHttpRequest' },
			});
			if (res.status === 401) {
				toast('Login required to like posts');
				return;
			}
			const ct = (res.headers.get('content-type') || '').toLowerCase();
			if (!res.ok || !ct.includes('application/json')) {
				toast('Could not update like. Try again.');
				return;
			}
			const data = await res.json().catch(() => null);
			if (data && data.success) {
				const likeCountSpan = document.getElementById(`likeCount-${id}`);
				const likeBtn = document.getElementById(`likeBtn-${id}`);
				if (likeCountSpan) likeCountSpan.textContent = data.likesCount;
				if (likeBtn)
					likeBtn.setAttribute('aria-pressed', data.liked ? 'true' : 'false');
			} else {
				toast('Could not update like. Try again.');
			}
		} catch (err) {
			console.error('Error liking post:', err);
			toast('Network error');
		}
	};

	// initialize like button state from markup (once)
	document.addEventListener('DOMContentLoaded', () => {
		$$('[id^="likeBtn-"]').forEach((btn) => {
			btn.dataset.postId =
				btn.dataset.postId || btn.id.replace(/^likeBtn-/, '');
			const id = btn.dataset.postId;
			const countEl = document.getElementById('likeCount-' + id);
			const count = countEl ? Number(countEl.textContent || 0) : undefined;
			const pressed = btn.getAttribute('aria-pressed') === 'true';
			setLikeUI(btn, pressed, count);
		});
	});

	// --------- MASONRY GRID (ResizeObserver + debounce) ---------
	const gridSelectors = ['#relatedGridMain', '#relatedGridAside'];
	const rafDebounce = (fn) => {
		let raf = null;
		return (...args) => {
			if (raf) cancelAnimationFrame(raf);
			raf = requestAnimationFrame(() => {
				raf = null;
				fn(...args);
			});
		};
	};

	function getNumericStyleProperty(el, prop) {
		const val = getComputedStyle(el).getPropertyValue(prop);
		return parseFloat(val) || 0;
	}

	function resizeMasonryGrid(grid) {
		if (!grid) return;
		const rowHeight = getNumericStyleProperty(grid, 'grid-auto-rows');
		const rowGap =
			getNumericStyleProperty(grid, 'gap') ||
			getNumericStyleProperty(grid, 'row-gap') ||
			0;
		Array.from(grid.children).forEach((item) => {
			const content = item.querySelector('.thumb') || item;
			if (!content) return;
			const height = content.getBoundingClientRect().height;
			const rowSpan = Math.max(
				1,
				Math.ceil((height + rowGap) / (rowHeight + rowGap)),
			);
			item.style.gridRowEnd = 'span ' + rowSpan;
		});
	}

	function setupGrid(selector) {
		const grid = document.querySelector(selector);
		if (!grid) return;
		const debounced = rafDebounce(() => resizeMasonryGrid(grid));
		// observe images and item size changes via ResizeObserver (more efficient than MutationObserver for layout)
		const ro = new ResizeObserver(debounced);
		Array.from(grid.querySelectorAll('img')).forEach((img) => {
			if (!img.complete)
				img.addEventListener('load', debounced, { once: true, passive: true });
			ro.observe(img);
		});
		Array.from(grid.children).forEach((child) => ro.observe(child));
		// fallback: observe grid changes (if items added/removed)
		const mo = new MutationObserver(debounced);
		mo.observe(grid, { childList: true, subtree: true });
		// initial calc
		setTimeout(() => resizeMasonryGrid(grid), 60);
		// window resize
		let rtid = 0;
		window.addEventListener(
			'resize',
			() => {
				clearTimeout(rtid);
				rtid = setTimeout(debounced, 120);
			},
			{ passive: true },
		);
	}

	document.addEventListener('DOMContentLoaded', () => {
		gridSelectors.forEach(setupGrid);
	});

	// --------- MODAL IMAGE PINCH-ZOOM (lightweight) ---------
	const modalImage = document.getElementById('modalImage');
	(function attachPinch() {
		if (!modalImage) return;
		let startDist = null;
		const dist = (t) => {
			const dx = t[0].pageX - t[1].pageX;
			const dy = t[0].pageY - t[1].pageY;
			return Math.hypot(dx, dy);
		};
		modalImage.addEventListener(
			'touchstart',
			(e) => {
				if (e.touches.length === 2) startDist = dist(e.touches);
			},
			{ passive: true },
		);
		modalImage.addEventListener(
			'touchmove',
			(e) => {
				if (e.touches.length === 2 && startDist) {
					const d = dist(e.touches);
					const ratio = d / startDist;
					modalImage.style.transform = `scale(${Math.min(
						3,
						Math.max(1, ratio),
					)})`;
				}
			},
			{ passive: true },
		);
		modalImage.addEventListener(
			'touchend',
			() => {
				startDist = null;
				modalImage.style.transform = '';
			},
			{ passive: true },
		);
	})();

	// --------- SHARE BUTTON & MENU (delegated + cached) ---------
	const shareBtn = document.getElementById('shareBtn');
	const shareMenu = document.getElementById('shareMenu');

	document.addEventListener('click', async (ev) => {
		// share button toggle
		if (ev.target.closest && ev.target.closest('#shareBtn')) {
			ev.stopPropagation();
			if (!shareBtn) return;
			const shareData = {
				title: document.title || '',
				text: document.title || '',
				url: window.location.href,
			};
			try {
				if (navigator.share) {
					await navigator.share(shareData);
				} else if (shareMenu) {
					const open = !shareMenu.classList.contains('hidden');
					shareMenu.classList.toggle('hidden', open);
					shareBtn.setAttribute('aria-expanded', String(!open));
				}
			} catch (e) {
				await navigator.clipboard?.writeText(window.location.href).catch(noop);
				toast('Link copied');
			}
			return;
		}

		// share menu actions
		const actionEl =
			ev.target.closest && ev.target.closest('#shareMenu [data-action]');
		if (actionEl && shareMenu && !shareMenu.classList.contains('hidden')) {
			const action = actionEl.getAttribute('data-action');
			if (action === 'copy') {
				await navigator.clipboard?.writeText(window.location.href).catch(noop);
				toast('Link copied');
			} else if (action === 'native' && navigator.share) {
				try {
					await navigator.share({
						title: document.title,
						text: document.title,
						url: window.location.href,
					});
				} catch (e) {}
			}
			shareMenu.classList.add('hidden');
			shareBtn?.setAttribute('aria-expanded', 'false');
			return;
		}

		// close share menu when clicking outside
		if (
			shareMenu &&
			!shareMenu.classList.contains('hidden') &&
			ev.target !== shareBtn &&
			!shareMenu.contains(ev.target)
		) {
			shareMenu.classList.add('hidden');
			shareBtn?.setAttribute('aria-expanded', 'false');
		}
	});

	// --------- COMMENTS (cached nodes, optimistic UI) ---------
	const mainEl = document.querySelector('main[data-post-id]');
	const postId = mainEl?.getAttribute('data-post-id');
	const input = postId
		? document.getElementById(`commentInput-${postId}`)
		: null;
	const postButton = postId
		? document.getElementById(`postComment-${postId}`)
		: null;
	const list = postId ? document.getElementById(`commentList-${postId}`) : null;
	const commentCountEl = postId
		? document.getElementById(`commentCount-${postId}`)
		: null;
	let currentUser = null;
	try {
		currentUser = JSON.parse(
			document.querySelector('main')?.dataset.currentUser || 'null',
		);
	} catch (e) {
		currentUser = null;
	}

	function createCommentNode({ username, profileimage, text, createdAt }) {
		const li = document.createElement('li');
		li.className =
			'px-3 py-2 rounded-lg bg-white/5 border border-white/10 flex items-start gap-3';
		li.innerHTML = `
			<img class="w-8 h-8 rounded-full object-cover" src="${
				profileimage || '/images/defaultpic.png'
			}" alt="${username || 'User'}">
			<div class="flex-1">
				<div class="text-sm font-semibold">${username || 'Unknown'}</div>
				<div class="text-sm mt-1 break-words">${text ? escapeHtml(text) : ''}</div>
				<div class="text-xs text-white/60 mt-1">${
					createdAt ? new Date(createdAt).toLocaleString() : ''
				}</div>
			</div>
		`;
		return li;
	}

	function escapeHtml(str = '') {
		return String(str).replace(
			/[&<>"']/g,
			(m) =>
				({
					'&': '&amp;',
					'<': '&lt;',
					'>': '&gt;',
					'"': '&quot;',
					"'": '&#39;',
				}[m]),
		);
	}

	if (postButton && input && list) {
		postButton.addEventListener('click', async () => {
			const text = (input.value || '').trim();
			if (!text) return;
			postButton.disabled = true;
			postButton.classList.add('opacity-60', 'pointer-events-none');
			const tempId = `temp-${now()}`;
			const optimisticNode = createCommentNode({
				username: currentUser?.username || 'You',
				profileimage: currentUser?.profileimage || '/images/defaultpic.png',
				text,
				createdAt: new Date().toISOString(),
			});
			optimisticNode.id = `comment-${tempId}`;
			list.prepend(optimisticNode);
			if (commentCountEl)
				commentCountEl.textContent = String(
					(+commentCountEl.textContent || 0) + 1,
				);
			try {
				const res = await fetch(`/posts/${postId}/comments`, {
					method: 'POST',
					credentials: 'same-origin',
					headers: {
						'Content-Type': 'application/json',
						'X-Requested-With': 'XMLHttpRequest',
					},
					body: JSON.stringify({ text }),
				});
				if (res.redirected) {
					window.location = res.url;
					return;
				}
				if (!res.ok) {
					let errMsg = 'Failed to post comment';
					const ct = res.headers.get('content-type') || '';
					if (ct.includes('application/json')) {
						const errJson = await res.json().catch(() => null);
						if (errJson && errJson.error) errMsg = errJson.error;
					}
					toast(errMsg);
					document.getElementById(`comment-${tempId}`)?.remove();
					if (commentCountEl)
						commentCountEl.textContent = String(
							Math.max(0, (+commentCountEl.textContent || 1) - 1),
						);
					return;
				}
				const ct = res.headers.get('content-type') || '';
				if (!ct.includes('application/json')) {
					toast('Unexpected server response');
					document.getElementById(`comment-${tempId}`)?.remove();
					if (commentCountEl)
						commentCountEl.textContent = String(
							Math.max(0, (+commentCountEl.textContent || 1) - 1),
						);
					return;
				}
				const data = await res.json().catch(() => null);
				if (data && data.success && data.comment) {
					document.getElementById(`comment-${tempId}`)?.remove();
					const c = data.comment;
					const serverNode = createCommentNode({
						username: c.user?.username || 'Unknown',
						profileimage: c.user?.profileimage || '/images/defaultpic.png',
						text: c.text,
						createdAt: c.createdAt,
					});
					list.prepend(serverNode);
				} else {
					toast(data?.error || 'Failed to post comment');
					document.getElementById(`comment-${tempId}`)?.remove();
					if (commentCountEl)
						commentCountEl.textContent = String(
							Math.max(0, (+commentCountEl.textContent || 1) - 1),
						);
				}
			} catch (err) {
				console.error('Comment post failed', err);
				toast('Network error');
				document.getElementById(`comment-${tempId}`)?.remove();
				if (commentCountEl)
					commentCountEl.textContent = String(
						Math.max(0, (+commentCountEl.textContent || 1) - 1),
					);
			} finally {
				postButton.disabled = false;
				postButton.classList.remove('opacity-60', 'pointer-events-none');
				input.value = '';
			}
		});
	}

	// --------- KEYBOARD SHORTCUTS (lightweight) ---------
	window.addEventListener('keydown', (e) => {
		const active = document.activeElement?.tagName;
		if (active === 'INPUT' || active === 'TEXTAREA') return;
		if (e.key === 'l' || e.key === 'L') {
			const likeBtn = postId
				? document.getElementById(`likeBtn-${postId}`)
				: null;
			if (likeBtn) likeBtn.click();
		}
		if (e.key === 'c' || e.key === 'C') {
			if (input) input.focus();
		}
	});
})();

(function () {
	const btn = document.getElementById('downloadBtn');

	function filenameFromUrl(url) {
		try {
			const u = new URL(url, location.href);
			const parts = u.pathname.split('/');
			let name = parts.pop() || parts.pop(); // handle trailing slash
			name = decodeURIComponent(name || 'image');
			if (!/\.\w{2,5}$/.test(name)) name += '.jpg'; // fallback extension
			return name;
		} catch (e) {
			return 'image.jpg';
		}
	}

	btn.addEventListener('click', async (ev) => {
		// Prevent default anchor behavior — we'll handle download
		ev.preventDefault();

		const url = btn.href;
		const desiredFilename =
			btn.getAttribute('data-filename') ||
			btn.getAttribute('download') ||
			filenameFromUrl(url);

		try {
			// Fetch the image as a blob
			const res = await fetch(url, { mode: 'cors' }); // leave mode for CORS; remove if same-origin
			if (!res.ok) throw new Error('Failed to fetch image: ' + res.status);

			const blob = await res.blob();

			// Create temporary object URL and trigger download
			const blobUrl = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.style.display = 'none';
			a.href = blobUrl;
			a.download = desiredFilename;
			document.body.appendChild(a);
			a.click();
			a.remove();

			// Release memory
			URL.revokeObjectURL(blobUrl);
		} catch (err) {
			console.error('Download failed:', err);
			// Fallback: open image in new tab (user can right-click → Save image as...)
			window.open(url, '_blank', 'noopener');
		}
	});
	
})();
