// --- 1. Site Detection & Logic Switch ---
const currentUrl = window.location.href;
// Since we removed the web communication listeners, content.js focuses on scraping.
initScraper();
setTimeout(initScraper, 2500);

// --- 2. Scraper Logic ---

function initScraper() {
    if (document.getElementById('shoplist-clipper-btn')) return;

    const btn = document.createElement('button');
    btn.id = 'shoplist-clipper-btn';
    btn.innerHTML = '<span>+</span> Save Item';
    btn.title = "Save this item to ShopList";
    document.body.appendChild(btn);

    btn.addEventListener('click', async () => {
        const originalText = btn.innerHTML;
        btn.innerHTML = '<span>...</span> Saving';
        btn.style.background = '#64748b';

        const product = scrapeProductData();
        
        if (!product || !product.title) {
            console.warn("ShopList Clipper: Scraping failed", product);
            btn.innerHTML = '<span>❌</span> Error';
            btn.style.background = '#ef4444';
            setTimeout(() => { btn.innerHTML = originalText; btn.style.background = ''; }, 2000);
            return;
        }

        // Save to Chrome Storage
        try {
            const result = await chrome.storage.local.get(['shoplist_inbox']);
            const inbox = result.shoplist_inbox || [];
            
            // Avoid exact duplicates
            if (!inbox.some(i => i.url === product.url)) {
                inbox.push(product);
                await chrome.storage.local.set({ shoplist_inbox: inbox });
                btn.innerHTML = '<span>✓</span> Saved!';
                btn.style.background = '#10b981';
            } else {
                btn.innerHTML = '<span>!</span> Saved';
                btn.style.background = '#f59e0b';
            }
        } catch (e) {
            console.error(e);
            btn.innerHTML = '<span>❌</span> Failed';
            btn.style.background = '#ef4444';
        }

        setTimeout(() => { btn.innerHTML = originalText; btn.style.background = ''; }, 3000);
    });
}

function scrapeProductData() {
    const url = window.location.href;
    let title = document.title;
    let price = 0;
    let image = "";

    try {
        // --- AliExpress Deep Scrape ---
        if (url.includes('aliexpress')) {
            const ogTitle = document.querySelector('meta[property="og:title"]');
            if (ogTitle) title = ogTitle.content.split('|')[0].trim();
            
            const ogImage = document.querySelector('meta[property="og:image"]');
            if (ogImage) image = ogImage.content;

            // Price Strategies
            let foundJsonPrice = false;
            const scripts = document.querySelectorAll('script');
            for(let s of scripts) {
                if(s.type === 'application/ld+json') {
                    try {
                        const json = JSON.parse(s.innerText);
                        const offer = Array.isArray(json.offers) ? json.offers[0] : json.offers;
                        if(offer && (offer.price || offer.lowPrice)) {
                            price = parseFloat(offer.price || offer.lowPrice);
                            foundJsonPrice = true;
                        }
                    } catch(e) {}
                }
                if(foundJsonPrice) break;
            }

            // Fallback to class selector for price
            if (!foundJsonPrice) {
                const priceElem = document.querySelector('[class*="price--current"], [class*="product-price-current"], [class*="price-default--current"]');
                if (priceElem) {
                     price = parsePrice(priceElem.innerText);
                }
            }
        } 
        
        // --- Amazon ---
        else if (url.includes('amazon')) {
            title = document.getElementById('productTitle')?.innerText.trim() || title;
            const priceElem = document.querySelector('.a-price .a-offscreen') || 
                              document.querySelector('#price_inside_buybox') ||
                              document.querySelector('.apexPriceToPay span');
            if (priceElem) price = parsePrice(priceElem.innerText);
            
            const landingImage = document.getElementById('landingImage');
            if (landingImage) {
                image = landingImage.getAttribute('data-old-hires') || landingImage.src;
            } else {
                 const imgElem = document.querySelector('#imgTagWrapperId img');
                 if (imgElem) image = imgElem.src;
            }
        } 
        
        // --- eBay ---
        else if (url.includes('ebay')) {
            const titleElem = document.querySelector('.x-item-title__mainTitle') || document.querySelector('#itemTitle');
            if (titleElem) title = titleElem.innerText.replace('Details about', '').trim();
            const priceElem = document.querySelector('.x-price-primary') || document.querySelector('.prcIsum');
            if (priceElem) price = parsePrice(priceElem.innerText);
            const imgElem = document.querySelector('.ux-image-carousel-item img') || document.querySelector('#icImg');
            if (imgElem) image = imgElem.src;
        }
    } catch (e) {
        console.warn("Scraping partial failure", e);
    }

    // Convert Image URL to Base64 to avoid Referrer issues
    // We do this by returning a Promise if possible, but initScraper expects sync return from scrapeProductData?
    // Wait, scrapeProductData returns an object. initScraper handles base64 conversion.
    // We will let initScraper handle the base64 conversion of 'image' url.
    
    return {
        id: Date.now(),
        url: cleanUrl(url),
        title: title || "Saved Item",
        price: price,
        image: image,
        imageFit: 'object-cover'
    };
}

async function imageUrlToBase64(url) {
    try {
        const response = await fetch(url);
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch(e) {
        return null;
    }
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
        if (u.hostname.includes('aliexpress')) return u.origin + u.pathname.replace(/.html.*/, '.html');
        return u.origin + u.pathname; 
    } catch (e) { return url; }
}