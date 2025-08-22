(function () {
	// small toast helper (re-uses your #toast element)
	const toast = (msg, ms = 1600) => {
		const el = document.getElementById('toast');
		if (!el) return;
		el.textContent = msg;
		el.classList.remove('hidden');
		clearTimeout(el._t);
		el._t = setTimeout(() => el.classList.add('hidden'), ms);
	};

	// update UI for a single like button
	function setLikeUI(btn, liked, likesCount) {
		if (!btn) return;
		btn.setAttribute('aria-pressed', liked ? 'true' : 'false');

		// toggle icons: show filled when liked, outline when not
		const heartLine = btn.querySelector('.ri-heart-line');
		const heartFill = btn.querySelector('.ri-heart-fill');

		if (heartLine) heartLine.classList.toggle('hidden', liked); // hide outline when liked
		if (heartFill) heartFill.classList.toggle('hidden', !liked); // show fill when liked

		// optional — provide a visible style change on liked state (you can style .liked in CSS)
		btn.classList.toggle('liked', liked);

		// update count display
		try {
			const id = btn.id.replace(/^likeBtn-/, '');
			const countSpan = document.getElementById('likeCount-' + id);
			if (countSpan && typeof likesCount !== 'undefined')
				countSpan.textContent = String(likesCount);
		} catch (e) {
			/* ignore */
		}
	}

	// single button wiring + handler
	async function handleLikeClick(btn) {
		if (!btn || btn.disabled) return;
		const postId = btn.id.replace(/^likeBtn-/, '');
		if (!postId) return;

		const wasLiked = btn.getAttribute('aria-pressed') === 'true';
		const countSpan = document.getElementById('likeCount-' + postId);
		const prevCount = countSpan
			? parseInt(countSpan.textContent || '0', 10)
			: 0;

		// optimistic update
		const optimisticCount = wasLiked
			? Math.max(0, prevCount - 1)
			: prevCount + 1;
		setLikeUI(btn, !wasLiked, optimisticCount);
		btn.disabled = true;

		try {
			const res = await fetch(`/posts/${encodeURIComponent(postId)}/like`, {
				method: 'POST',
				credentials: 'same-origin',
				headers: { 'X-Requested-With': 'XMLHttpRequest' },
			});

			if (res.status === 401) {
				// rollback
				setLikeUI(btn, wasLiked, prevCount);
				toast('Login required to like posts');
				return;
			}

			const ct = (res.headers.get('content-type') || '').toLowerCase();
			if (!res.ok || !ct.includes('application/json')) {
				setLikeUI(btn, wasLiked, prevCount);
				toast('Could not update like. Try again.');
				console.error('Unexpected response from like endpoint', res.status);
				return;
			}

			const data = await res.json().catch(() => null);
			if (!data || !data.success) {
				setLikeUI(btn, wasLiked, prevCount);
				toast(data?.error || 'Failed to update like');
				return;
			}

			// apply server-truth (data.liked, data.likesCount)
			const serverLiked = !!data.liked;
			const serverCount =
				typeof data.likesCount === 'number' ? data.likesCount : optimisticCount;
			setLikeUI(btn, serverLiked, serverCount);
		} catch (err) {
			console.error('Network error while toggling like:', err);
			setLikeUI(btn, wasLiked, prevCount);
			toast('Network error');
		} finally {
			btn.disabled = false;
		}
	}

	// wire a button (id starts with likeBtn-)
	function wireLikeButton(btn) {
		if (!btn || btn._likeWired) return;
		btn._likeWired = true;

		// ensure initial UI matches aria-pressed attribute and count
		const id = btn.id.replace(/^likeBtn-/, '');
		const initialPressed = btn.getAttribute('aria-pressed') === 'true';
		const countSpan = document.getElementById('likeCount-' + id);
		const initialCount = countSpan
			? parseInt(countSpan.textContent || '0', 10)
			: undefined;
		setLikeUI(btn, initialPressed, initialCount);

		btn.addEventListener('click', (ev) => {
			ev.preventDefault();
			handleLikeClick(btn);
		});
	}

	// wire existing buttons and observe for future ones
	function wireAllLikeButtons() {
		document.querySelectorAll('[id^="likeBtn-"]').forEach(wireLikeButton);
	}

	document.addEventListener('DOMContentLoaded', () => {
		wireAllLikeButtons();

		// observe DOM changes so dynamically added posts are wired
		const mo = new MutationObserver(() => wireAllLikeButtons());
		mo.observe(document.body, { childList: true, subtree: true });
	});
})();

(function () {
	const grids = ['#relatedGridMain', '#relatedGridAside'];

	function getNumericStyleProperty(el, prop) {
		const val = getComputedStyle(el).getPropertyValue(prop);
		return parseFloat(val) || 0;
	}

	function resizeMasonryGrid(grid) {
		if (!grid) return;
		const rowHeight = getNumericStyleProperty(grid, 'grid-auto-rows'); // px
		const rowGap = getNumericStyleProperty(grid, 'gap'); // px
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

		const imgs = grid.querySelectorAll('img');
		imgs.forEach((img) => {
			if (img.complete) return;
			img.addEventListener('load', () => resizeMasonryGrid(grid), {
				once: true,
			});
			img.addEventListener('error', () => resizeMasonryGrid(grid), {
				once: true,
			});
		});

		const mo = new MutationObserver(() => {
			setTimeout(() => resizeMasonryGrid(grid), 60);
		});
		mo.observe(grid, { childList: true, subtree: true });

		setTimeout(() => resizeMasonryGrid(grid), 60);

		let r;
		window.addEventListener('resize', () => {
			clearTimeout(r);
			r = setTimeout(() => resizeMasonryGrid(grid), 120);
		});
	}

	document.addEventListener('DOMContentLoaded', () => {
		grids.forEach((sel) => setupGrid(sel));
	});
})();

(() => {
	const $ = (sel, root = document) => root.querySelector(sel);
	const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
	const toast = (msg) => {
		const el = document.getElementById('toast');
		if (!el) return;
		el.textContent = msg;
		el.classList.remove('hidden');
		clearTimeout(el._t);
		el._t = setTimeout(() => el.classList.add('hidden'), 1600);
	};

	const wrap = document.getElementById('modalImageWrap');
	const img = document.getElementById('modalImage');

	const shareBtn = document.getElementById('shareBtn');
	const shareMenu = document.getElementById('shareMenu');
	const postId = document
		.querySelector('main[data-post-id]')
		?.getAttribute('data-post-id');

	const likeBtn = postId ? document.getElementById(`likeBtn-${postId}`) : null;
	const likeCountSpan = postId
		? document.getElementById(`likeCount-${postId}`)
		: null;

	// Expose toggleLike globally
	window.toggleLike = async function toggleLike(postIdArg) {
		const id = postIdArg || postId;
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

			const ct = res.headers.get('content-type') || '';
			if (!res.ok || !ct.includes('application/json')) {
				toast('Could not update like. Try again.');
				return;
			}

			const data = await res.json();
			if (data && data.success) {
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

	// Pinch zoom (kept)
	(function attachPinch() {
		let startDist = null;
		function dist(t) {
			const dx = t[0].pageX - t[1].pageX;
			const dy = t[0].pageY - t[1].pageY;
			return Math.hypot(dx, dy);
		}
		img?.addEventListener(
			'touchstart',
			(e) => {
				if (e.touches.length === 2) startDist = dist(e.touches);
			},
			{ passive: true },
		);
		img?.addEventListener(
			'touchmove',
			(e) => {
				if (e.touches.length === 2 && startDist) {
					const d = dist(e.touches);
					const ratio = d / startDist;
					img.style.transform = `scale(${Math.min(3, Math.max(1, ratio))})`;
				}
			},
			{ passive: true },
		);
		img?.addEventListener(
			'touchend',
			() => {
				startDist = null;
				if (img) img.style.transform = '';
			},
			{ passive: true },
		);
	})();

	// Share handling: use Web Share when available, otherwise open dropdown
	shareBtn?.addEventListener('click', async (ev) => {
		ev.stopPropagation();
		const shareData = {
			title: document.title || '<%= title %>',
			text: '<%= title %>',
			url: window.location.href,
		};
		try {
			if (navigator.share) {
				await navigator.share(shareData);
			} else {
				// toggle menu
				if (shareMenu) {
					const open = !shareMenu.classList.contains('hidden');
					shareMenu.classList.toggle('hidden', open);
					shareBtn.setAttribute('aria-expanded', String(!open));
				}
			}
		} catch (e) {
			// fallback: copy link
			await navigator.clipboard
				?.writeText(window.location.href)
				.catch(() => {});
			toast('Link copied');
		}
	});

	// share menu actions (copy / native)
	shareMenu?.addEventListener('click', async (ev) => {
		const action = ev.target
			.closest('[data-action]')
			?.getAttribute('data-action');
		if (!action) return;
		if (action === 'copy') {
			await navigator.clipboard
				?.writeText(window.location.href)
				.catch(() => {});
			toast('Link copied');
			shareMenu.classList.add('hidden');
			shareBtn.setAttribute('aria-expanded', 'false');
		}
		if (action === 'native') {
			if (navigator.share) {
				try {
					await navigator.share({
						title: document.title,
						text: document.title,
						url: window.location.href,
					});
				} catch (e) {}
			}
			shareMenu.classList.add('hidden');
			shareBtn.setAttribute('aria-expanded', 'false');
		}
	});

	// close share menu on outside click
	document.addEventListener('click', (ev) => {
		if (!shareMenu) return;
		if (
			!shareMenu.classList.contains('hidden') &&
			!shareMenu.contains(ev.target) &&
			ev.target !== shareBtn
		) {
			shareMenu.classList.add('hidden');
			shareBtn.setAttribute('aria-expanded', 'false');
		}
	});

	// ===== COMMENTS =====
	const input = document.getElementById(`commentInput-${postId}`);
	const postButton = document.getElementById(`postComment-${postId}`);
	const list = document.getElementById(`commentList-${postId}`);

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
		const imgEl = document.createElement('img');
		imgEl.className = 'w-8 h-8 rounded-full object-cover';
		imgEl.src = profileimage || '/images/defaultpic.png';
		const inner = document.createElement('div');
		inner.className = 'flex-1';
		const who = document.createElement('div');
		who.className = 'text-sm font-semibold';
		who.textContent = username || 'Unknown';
		const content = document.createElement('div');
		content.className = 'text-sm mt-1 break-words';
		content.textContent = text || '';
		const when = document.createElement('div');
		when.className = 'text-xs text-white/60 mt-1';
		when.textContent = createdAt ? new Date(createdAt).toLocaleString() : '';
		inner.appendChild(who);
		inner.appendChild(content);
		inner.appendChild(when);
		li.appendChild(imgEl);
		li.appendChild(inner);
		return li;
	}

	postButton?.addEventListener('click', async () => {
		const text = (input?.value || '').trim();
		if (!text) return;

		postButton.disabled = true;
		postButton.classList.add('opacity-60', 'pointer-events-none');

		const tempId = `temp-${Date.now()}`;
		const optimisticNode = createCommentNode({
			username:
				currentUser && currentUser.username ? currentUser.username : 'You',
			profileimage:
				currentUser && currentUser.profileimage
					? currentUser.profileimage
					: '/images/defaultpic.png',
			text,
			createdAt: new Date().toISOString(),
		});
		optimisticNode.id = `comment-${tempId}`;
		list?.prepend(optimisticNode);

		const cc = document.getElementById(`commentCount-${postId}`);
		if (cc) cc.textContent = String((+cc.textContent || 0) + 1);

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
				if (cc)
					cc.textContent = String(Math.max(0, (+cc.textContent || 1) - 1));
				return;
			}

			const ct = res.headers.get('content-type') || '';
			if (!ct.includes('application/json')) {
				toast('Unexpected server response');
				document.getElementById(`comment-${tempId}`)?.remove();
				if (cc)
					cc.textContent = String(Math.max(0, (+cc.textContent || 1) - 1));
				return;
			}

			const data = await res.json();
			if (data && data.success && data.comment) {
				document.getElementById(`comment-${tempId}`)?.remove();
				const c = data.comment;
				const serverNode = createCommentNode({
					username: c.user && c.user.username ? c.user.username : 'Unknown',
					profileimage:
						c.user && c.user.profileimage
							? c.user.profileimage
							: '/images/defaultpic.png',
					text: c.text,
					createdAt: c.createdAt,
				});
				list?.prepend(serverNode);
			} else {
				toast(data?.error || 'Failed to post comment');
				document.getElementById(`comment-${tempId}`)?.remove();
				if (cc)
					cc.textContent = String(Math.max(0, (+cc.textContent || 1) - 1));
			}
		} catch (err) {
			console.error('Comment post failed', err);
			toast('Network error');
			document.getElementById(`comment-${tempId}`)?.remove();
			if (cc) cc.textContent = String(Math.max(0, (+cc.textContent || 1) - 1));
		} finally {
			postButton.disabled = false;
			postButton.classList.remove('opacity-60', 'pointer-events-none');
			if (input) input.value = '';
		}
	});

	// keyboard shortcuts
	window.addEventListener('keydown', (e) => {
		if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
		if (e.key === 'l' || e.key === 'L') likeBtn?.click();
		if (e.key === 'c' || e.key === 'C') input?.focus();
	});
})();
