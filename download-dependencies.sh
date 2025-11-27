#!/bin/bash

cd shoplist-extension

# Create the lib directory structure
mkdir -p lib/fontawesome/css
mkdir -p lib/fontawesome/webfonts

echo "Downloading libraries..."

# 1. Tailwind CSS (Full Script)
curl -L -o lib/tailwindcss.js https://cdn.tailwindcss.com

# 2. FontAwesome CSS
curl -L -o lib/fontawesome/css/all.min.css https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css

# Note: FontAwesome Webfonts are binary files and tricky to curl individually without a zip. 
# For this script, we will grab the .woff2 files which cover most modern browsers.
curl -L -o lib/fontawesome/webfonts/fa-solid-900.woff2 https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-solid-900.woff2
curl -L -o lib/fontawesome/webfonts/fa-regular-400.woff2 https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-regular-400.woff2

# 3. HTML2PDF
curl -L -o lib/html2pdf.bundle.min.js https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js

# 4. SortableJS
curl -L -o lib/Sortable.min.js https://cdnjs.cloudflare.com/ajax/libs/Sortable/1.15.0/Sortable.min.js

# 5. LZ-String
curl -L -o lib/lz-string.min.js https://cdnjs.cloudflare.com/ajax/libs/lz-string/1.4.4/lz-string.min.js

echo "Download complete! Your 'lib' folder is ready."