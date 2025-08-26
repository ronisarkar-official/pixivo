(function () {
	const defaultFallback = '/images/defaultpic.jpg'; // change to your actual fallback
	const imgs = Array.from(document.querySelectorAll('img.pin-img'));

	if (!imgs.length) {
		console.warn(
			'No images found matching selector img.pin-img — check your markup.',
		);
	}

	imgs.forEach((img, i) => {
		// Log basic info
		console.groupCollapsed(`pin-img[${i}]`);
		console.log('src:', img.getAttribute('src'));
		console.log('data-src:', img.getAttribute('data-src'));
		console.log(
			'naturalWidth:',
			img.naturalWidth,
			'naturalHeight:',
			img.naturalHeight,
		);
		console.log('complete:', img.complete);
		console.groupEnd();

		// Ensure the img is visible for debugging
		img.style.visibility = 'visible';
		img.style.backgroundColor = 'rgba(255,255,255,0.02)'; // subtle placeholder

		// If no src but data-src exists, swap it (if you used data-src approach)
		if (!img.getAttribute('src') && img.getAttribute('data-src')) {
			img.src = img.getAttribute('data-src');
		}

		// Add robust load handler — cover cached images too
		function markLoaded() {
			img.classList.add('loaded');
			img.style.opacity = ''; // let CSS control it; we remove inline forcing
		}

		img.addEventListener(
			'load',
			() => {
				markLoaded();
			},
			{ once: true },
		);

		// If already complete and has natural size, mark as loaded now
		if (img.complete && img.naturalWidth && img.naturalWidth > 1) {
			markLoaded();
		}

		// Fallback: if image fails to load, show default fallback
		img.addEventListener(
			'error',
			() => {
				console.warn('Image failed to load, swapping fallback:', img.src);
				if (img.src !== defaultFallback) {
					img.src = defaultFallback;
				} else {
					// final fallback: show a tiny SVG so some pixels appear
					img.src =
						'data:image/svg+xml;charset=utf8,' +
						encodeURIComponent(
							'<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect fill="#222" width="100%" height="100%"/><text fill="#888" x="50%" y="50%" dominant-baseline="middle" text-anchor="middle">Image</text></svg>',
						);
				}
			},
			{ once: true },
		);

		// If still invisible, bump opacity for debugging (remove in production)
		if (!img.classList.contains('loaded')) {
			// temporarily show it so you can inspect what's rendered
			img.style.opacity = '1';
		}
	});

	// Extra quick helper you can run in console: list any 404s from <img> tags
	window.logBrokenImages = () => {
		document.querySelectorAll('img').forEach((i) => {
			if (i.complete && (!i.naturalWidth || i.naturalWidth === 0)) {
				console.error('Broken image:', i.src, i);
			}
		});
	};

	// Auto-run one quick check after a second to report broken images
	setTimeout(() => {
		console.info(
			'Auto-check broken images: run window.logBrokenImages() for details.',
		);
		window.logBrokenImages();
	}, 1000);
})();
