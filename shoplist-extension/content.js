// --- Scraper Logic ---

// Run scraping logic only if we are NOT on the internal manager page
if (!window.location.href.includes('manager.html')) {
    initScraper();
    // Run again after delay for dynamic sites (AliExpress/eBay SPAs)
    setTimeout(initScraper, 2500);
}

function initScraper() {
    if (document.getElementById('shoplist-clipper-btn')) return;

    const btn = document.createElement('button');
    btn.id = 'shoplist-clipper-btn';
    btn.innerHTML = '<span>+</span> Save Item';
    btn.title = "Save this item to ShopList";
    document.body.appendChild(btn);

    btn.addEventListener('click', async () => {
        const originalText = btn.innerHTML;
        btn.innerHTML = '<span>...</span> Processing';
        btn.style.background = '#64748b';

        try {
            // 1. Scrape basic data
            const product = scrapeProductData();
            
            if (!product || !product.title) {
                throw new Error("Could not find product title");
            }

            // 2. Convert Image URL to Base64 (Permanent Storage)
            // This solves the "Referrer" and "403 Forbidden" issues
            if (product.image && product.image.startsWith('http')) {
                btn.innerHTML = '<span>...</span> Downloading Image';
                try {
                    const base64Image = await imageUrlToBase64(product.image);
                    if (base64Image) product.image = base64Image;
                } catch (imgErr) {
                    console.warn("Image download failed, falling back to URL", imgErr);
                }
            }

            // 3. Save to Chrome Storage (Inbox)
            const result = await chrome.storage.local.get(['shoplist_inbox']);
            const inbox = result.shoplist_inbox || [];
            
            // Avoid exact duplicates
            if (!inbox.some(i => i.url === product.url)) {
                inbox.push(product);
                await chrome.storage.local.set({ shoplist_inbox: inbox });
                btn.innerHTML = '<span>✓</span> Saved!';
                btn.style.background = '#10b981';
            } else {
                btn.innerHTML = '<span>!</span> Already Saved';
                btn.style.background = '#f59e0b';
            }
        } catch (e) {
            console.error("ShopList Error:", e);
            btn.innerHTML = '<span>❌</span> Failed';
            btn.style.background = '#ef4444';
        }

        setTimeout(() => { 
            btn.innerHTML = '<span>+</span> Save Item'; 
            btn.style.background = ''; 
        }, 3000);
    });
}

function scrapeProductData() {
    const url = window.location.href;
    let title = document.title;
    let price = 0;
    let image = "";

    try {
        // --- AliExpress ---
        if (url.includes('aliexpress')) {
            const ogTitle = document.querySelector('meta[property="og:title"]');
            if (ogTitle) title = ogTitle.content.split('|')[0].trim();
            
            const ogImage = document.querySelector('meta[property="og:image"]');
            if (ogImage) image = ogImage.content;

            // Try JSON-LD for price
            const scripts = document.querySelectorAll('script');
            let foundPrice = false;
            for(let s of scripts) {
                if(s.type === 'application/ld+json') {
                    try {
                        const json = JSON.parse(s.innerText);
                        const offer = Array.isArray(json.offers) ? json.offers[0] : json.offers;
                        if(offer && (offer.price || offer.lowPrice)) {
                            price = parseFloat(offer.price || offer.lowPrice);
                            foundPrice = true;
                        }
                    } catch(e) {}
                }
                if(foundPrice) break;
            }
            if (!foundPrice) {
                const priceElem = document.querySelector('[class*="price--current"], [class*="product-price-current"]');
                if (priceElem) price = parsePrice(priceElem.innerText);
            }
        } 
        // --- Amazon ---
        else if (url.includes('amazon')) {
            title = document.getElementById('productTitle')?.innerText.trim() || title;
            
            // Try getting high-res image from JSON data in script tags if possible
            const landingImage = document.getElementById('landingImage');
            if (landingImage) {
                image = landingImage.getAttribute('data-old-hires') || landingImage.src;
            }

            const priceElem = document.querySelector('.a-price .a-offscreen') || document.querySelector('.apexPriceToPay span');
            if (priceElem) price = parsePrice(priceElem.innerText);
        } 
        // --- eBay ---
        else if (url.includes('ebay')) {
            const titleElem = document.querySelector('.x-item-title__mainTitle');
            if (titleElem) title = titleElem.innerText.replace('Details about', '').trim();
            
            const imgElem = document.querySelector('.ux-image-carousel-item img');
            if (imgElem) image = imgElem.src;

            const priceElem = document.querySelector('.x-price-primary');
            if (priceElem) price = parsePrice(priceElem.innerText);
        }
        // --- General Fallback (OpenGraph) ---
        else {
            const ogTitle = document.querySelector('meta[property="og:title"]');
            if (ogTitle) title = ogTitle.content;
            const ogImage = document.querySelector('meta[property="og:image"]');
            if (ogImage) image = ogImage.content;
        }

    } catch (e) {
        console.warn("Scraping issue", e);
    }

    return {
        id: Date.now(),
        url: cleanUrl(url),
        title: title || "Saved Item",
        price: price,
        image: image,
        imageFit: 'object-contain'
    };
}

// Helper: Fetch image URL and return Base64 Data URI
async function imageUrlToBase64(url) {
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

function parsePrice(str) {
    if (!str) return 0;
    const match = str.match(/(\d[\d,\.]*)/);
    if (match) return parseFloat(match[0].replace(/,/g, ''));
    return 0;
}

function cleanUrl(url) {
    try {
        const u = new URL(url);
        // Clean up AliExpress URLs
        if (u.hostname.includes('aliexpress')) return u.origin + u.pathname.replace(/.html.*/, '.html');
        return u.origin + u.pathname; 
    } catch (e) { return url; }
}