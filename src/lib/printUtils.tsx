import React from 'react';
import { createRoot } from 'react-dom/client';

/**
 * Utility to print a React component by rendering it into a hidden iframe.
 * This is much more reliable than trying to hide/show parts of the main page.
 */
export const printComponent = async (Component: React.ReactElement, title: string = 'Print') => {
  return new Promise<void>((resolve) => {
    // 1. Create hidden iframe but technically visible for print engine
    const iframe = document.createElement('iframe');
    iframe.style.position = 'absolute';
    iframe.style.left = '-9999px';
    iframe.style.top = '-9999px';
    iframe.style.width = '100mm';
    iframe.style.height = '150mm';
    iframe.style.border = '0';
    iframe.title = title;
    
    document.body.appendChild(iframe);

    // 2. Prepare iframe content
    const iframeDoc = iframe.contentWindow?.document || iframe.contentDocument;
    if (!iframeDoc) {
      document.body.removeChild(iframe);
      resolve();
      return;
    }

    // Write a basic HTML structure
    iframeDoc.open();
    iframeDoc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${title}</title>
          <link rel="preconnect" href="https://fonts.googleapis.com">
          <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
          <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&family=Be+Vietnam+Pro:wght@400;700;900&display=swap" rel="stylesheet">
        </head>
        <body style="margin: 0; padding: 0; background: white;">
          <div id="print-root" class="print-only"></div>
        </body>
      </html>
    `);
    iframeDoc.close();

    // 3. Inject styles from the main document
    const head = iframeDoc.head;
    document.querySelectorAll('style, link[rel="stylesheet"]').forEach(style => {
      // Don't re-inject the fonts we just added manually
      if (style.tagName === 'LINK' && (style as HTMLLinkElement).href.includes('fonts.googleapis.com')) return;
      head.appendChild(style.cloneNode(true));
    });

    // 4. Add specialized print styles that OVERRIDE everything
    const printStyles = document.createElement('style');
    printStyles.innerHTML = `
      #print-root, #print-root * {
        visibility: visible !important;
        opacity: 1 !important;
        box-sizing: border-box !important;
      }
      
      /* Reset specifically for table-related elements */
      #print-root table { display: table !important; }
      #print-root tr { display: table-row !important; }
      #print-root td, #print-root th { display: table-cell !important; }
      #print-root tbody { display: table-row-group !important; }
      
      /* Barcode fix: Barcode renders as SVG usually */
      #print-root svg {
        display: block !important;
        max-width: 100% !important;
        margin: 0 auto !important;
      }

      body { 
        margin: 0 !important; 
        padding: 0 !important; 
        background: white !important;
        width: 100mm !important;
        height: 150mm !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      
      #print-root {
        display: block !important;
        width: 100mm !important;
        height: 150mm !important;
        margin: 0 !important;
        padding: 0 !important;
        background: white !important;
        overflow: hidden !important;
      }

      .thermal-label {
        background: white !important;
        color: black !important;
        width: 100mm !important;
        height: 150mm !important;
        padding: 6mm !important;
      }
      
      .thermal-label * {
        font-family: Inter, "Be Vietnam Pro", sans-serif !important;
      }
      
      @page {
        size: 100mm 150mm;
        margin: 0;
      }
    `;
    head.appendChild(printStyles);

    // 5. Render component
    const container = iframeDoc.getElementById('print-root');
    if (!container) {
      document.body.removeChild(iframe);
      resolve();
      return;
    }

    const root = createRoot(container);
    root.render(Component);

    // 6. Wait for content to load
    const images = iframeDoc.getElementsByTagName('img');
    const imagePromises = Array.from(images).map(img => {
      if (img.complete) return Promise.resolve();
      return new Promise(resolveImg => {
        img.onload = resolveImg;
        img.onerror = resolveImg;
      });
    });

    // Wait for all images + a fixed safety delay for React rendering/Barcode gen
    Promise.all(imagePromises).then(() => {
      // Use requestAnimationFrame to ensure the browser has painted the content
      window.requestAnimationFrame(() => {
        setTimeout(() => {
          try {
            console.log('[PrintUtils] Triggering print command');
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
          } catch (err) {
            console.error('[PrintUtils] Print failed:', err);
          }
          
          // 8. Cleanup
          setTimeout(() => {
            if (document.body.contains(iframe)) {
              document.body.removeChild(iframe);
            }
            resolve();
          }, 1500); // Wait longer before removing iframe
        }, 1200); // 1.2s safety margin after images load
      });
    });
  });
};
