document.addEventListener('DOMContentLoaded', () => {
	// DOM refs
	const imageModal = document.getElementById('imageModal');
	const modalBackdrop = document.getElementById('modalBackdrop');
	const modalPanel = document.getElementById('modalPanel');
	const modalImage = document.getElementById('modalImage');
	const modalTitle = document.getElementById('modalTitle');
	const modalDesc = document.getElementById('modalDesc');

	const modalAuthorImg = document.getElementById('modalAuthorImg');
	const modalAuthorName = document.getElementById('modalAuthorName');
	const modalAuthorUsername = document.getElementById('modalAuthorUsername');

	const closeBtns = Array.from(document.querySelectorAll('#closeModalBtn'));
	const expandBtn = document.getElementById('expandBtn');
	const rotateBtn = document.getElementById('rotateBtn');
	const followBtn = document.getElementById('followBtn');
	const postCommentBtn = document.getElementById('postComment');

	// collections
	const cards = Array.from(document.querySelectorAll('[data-index]')); // gallery cards
	const thumbs = Array.from(document.querySelectorAll('.more-thumb')); // more-like-this thumbs

	let currentIndex = -1;
	let rotation = 0;

	// helpers
	function setAuthorFromCard(card) {
		if (!card) return;
		modalAuthorImg.src =
			card.dataset.authorImage || '/images/uploads/defaultpic.jpg';
		modalAuthorImg.alt = card.dataset.authorFullname || 'Author';
		modalAuthorName.textContent = card.dataset.authorFullname || 'Unknown';
		modalAuthorUsername.textContent = card.dataset.authorUsername
			? '@' + card.dataset.authorUsername
			: '';
	}

	function setAuthorFromThumb(thumb) {
		if (!thumb) return;
		modalAuthorImg.src =
			thumb.dataset.thumbAuthorImage || '/images/uploads/defaultpic.jpg';
		modalAuthorImg.alt = thumb.dataset.thumbAuthorFullname || 'Author';
		modalAuthorName.textContent =
			thumb.dataset.thumbAuthorFullname || 'Unknown';
		modalAuthorUsername.textContent = thumb.dataset.thumbAuthorUsername
			? '@' + thumb.dataset.thumbAuthorUsername
			: '';
	}

	function open(index) {
		const card = cards[index];
		if (!card) return;
		currentIndex = index;
		rotation = 0;
		modalImage.style.transform = 'rotate(0deg)';
		modalImage.src = card.dataset.image;
		modalImage.alt = card.dataset.title || '';
		modalTitle.textContent = card.dataset.title || '';
		modalDesc.textContent = card.dataset.desc || '';
		setAuthorFromCard(card);

		imageModal.classList.add('show');
		// allow CSS transitions to run
		setTimeout(() => imageModal.classList.add('visible'), 10);
	}

	function openByData(image, title = '', desc = '', thumb = null) {
		// if this image exists in gallery, open that index (so navigation works)
		const idx = cards.findIndex((c) => c.dataset.image === image);
		if (idx !== -1) {
			open(idx);
			return;
		}
		// fallback: display direct image (thumb may provide author)
		rotation = 0;
		modalImage.style.transform = 'rotate(0deg)';
		modalImage.src = image;
		modalImage.alt = title;
		modalTitle.textContent = title || '';
		modalDesc.textContent = desc || '';
		if (thumb) setAuthorFromThumb(thumb);
		else {
			// clear to defaults
			modalAuthorImg.src = '/images/uploads/defaultpic.jpg';
			modalAuthorName.textContent = 'Unknown';
			modalAuthorUsername.textContent = '@unknown';
		}
		currentIndex = -1;
		imageModal.classList.add('show');
		setTimeout(() => imageModal.classList.add('visible'), 10);
	}

	function close() {
		imageModal.classList.remove('visible');
		setTimeout(() => {
			imageModal.classList.remove('show');
			modalImage.src = '';
			modalTitle.textContent = '';
			modalDesc.textContent = '';
			currentIndex = -1;
		}, 250);
	}

	function showNext() {
		if (currentIndex === -1) return;
		if (currentIndex < cards.length - 1) open(currentIndex + 1);
	}
	function showPrev() {
		if (currentIndex === -1) return;
		if (currentIndex > 0) open(currentIndex - 1);
	}

	// gallery open
	cards.forEach((c, i) => c.addEventListener('click', () => open(i)));

	// thumbs open
	thumbs.forEach((t) => {
		t.style.cursor = 'pointer';
		t.addEventListener('click', (e) => {
			e.stopPropagation();
			openByData(
				t.dataset.thumbImage,
				t.dataset.thumbTitle || '',
				t.dataset.thumbDesc || '',
				t,
			);
		});
	});

	// close handlers
	closeBtns.forEach((b) => b.addEventListener('click', close));
	modalBackdrop.addEventListener('click', close);

	// keyboard navigation
	document.addEventListener('keydown', (e) => {
		if (!imageModal.classList.contains('show')) return;
		if (e.key === 'Escape') close();
		if (e.key === 'ArrowRight') showNext();
		if (e.key === 'ArrowLeft') showPrev();
	});

	// expand to new tab
	expandBtn?.addEventListener('click', () => {
		if (!modalImage.src) return;
		window.open(modalImage.src, '_blank', 'noopener');
	});

	// rotate
	rotateBtn?.addEventListener('click', () => {
		rotation = (rotation + 90) % 360;
		modalImage.style.transform = `rotate(${rotation}deg)`;
	});

	// follow button (placeholder behavior)
	followBtn?.addEventListener('click', (e) => {
		e.stopPropagation();
		followBtn.textContent =
			followBtn.textContent.trim() === 'Follow' ? 'Following' : 'Follow';
	});

	// post comment (placeholder)
	postCommentBtn?.addEventListener('click', () => {
		const input = document.getElementById('commentInput');
		if (input && input.value.trim()) {
			// replace with actual POST request in production
			alert('Comment posted: ' + input.value.trim());
			input.value = '';
		}
	});

	// swipe support on modalPanel
	let touchStartX = 0,
		touchEndX = 0;
	modalPanel?.addEventListener(
		'touchstart',
		(e) => (touchStartX = e.changedTouches[0].screenX),
	);
	modalPanel?.addEventListener('touchend', (e) => {
		touchEndX = e.changedTouches[0].screenX;
		const dist = touchEndX - touchStartX;
		if (Math.abs(dist) > 50) {
			if (dist < 0) showNext();
			else showPrev();
		}
	});
});
