import React from 'react';
import { createRoot } from 'react-dom/client';

/**
 * Utility to print a React component by rendering it into a hidden iframe.
 * This is much more reliable than trying to hide/show parts of the main page.
 */
export const printComponent = async (Component: React.ReactElement, title: string = 'Print') => {
  return new Promise<void>((resolve) => {
    // 1. Create hidden iframe
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '100mm'; // Give it some size
    iframe.style.height = '150mm';
    iframe.style.border = '0';
    iframe.style.zIndex = '-1';
    iframe.style.visibility = 'hidden';
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
      head.appendChild(style.cloneNode(true));
    });

    // 4. Add specialized print styles that OVERRIDE everything
    const printStyles = document.createElement('style');
    printStyles.innerHTML = `
      /* Ensure everything is visible in the container for both Screen and Print */
      #print-root, #print-root * {
        display: block !important;
        visibility: visible !important;
        opacity: 1 !important;
        box-sizing: border-box !important;
      }
      
      /* Reset specifically for table-related elements which should NOT be block */
      #print-root table { display: table !important; }
      #print-root tr { display: table-row !important; }
      #print-root td, #print-root th { display: table-cell !important; }
      #print-root tbody { display: table-row-group !important; }
      
      /* Barcode fix: Barcode renders as SVG usually, SVGs should be block to fill area but not forced to 100x150 always */
      #print-root svg {
        display: block !important;
        max-width: 100% !important;
      }

      body { 
        margin: 0 !important; 
        padding: 0 !important; 
        background: white !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      
      @page {
        size: 100mm 150mm;
        margin: 0;
      }
      
      .thermal-label-container, .thermal-label {
        width: 100mm !important;
        height: 150mm !important;
        overflow: hidden !important;
        margin: 0 !important;
        padding: 6mm !important;
      }
      
      .thermal-label * {
        font-family: Inter, "Be Vietnam Pro", sans-serif !important;
      }

      /* Hide any elements that shouldn't be printed if they somehow got in */
      .no-print { display: none !important; }
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
          document.body.removeChild(iframe);
          resolve();
        }, 1000);
      }, 1000); // 1s safety margin after images load
    });
  });
};
