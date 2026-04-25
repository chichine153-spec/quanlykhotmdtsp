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
    iframe.style.position = 'fixed';
    iframe.style.left = '0';
    iframe.style.top = '0';
    iframe.style.width = '100mm';
    iframe.style.height = '150mm';
    iframe.style.border = '0';
    iframe.style.zIndex = '-9999';
    iframe.style.opacity = '0';
    iframe.style.pointerEvents = 'none';
    iframe.title = title;
    
    document.body.appendChild(iframe);

    // 2. Prepare iframe content
    const iframeDoc = iframe.contentWindow?.document || iframe.contentDocument;
    if (!iframeDoc) {
      document.body.removeChild(iframe);
      resolve();
      return;
    }

    // Write a robust HTML structure with explicit reset for print media
    iframeDoc.open();
    iframeDoc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${title}</title>
          <style>
            /* Force Arial for the print engine */
            @media print {
              html, body, body * {
                font-family: Arial, Helvetica, sans-serif !important;
                visibility: visible !important;
                display: block !important;
                background-color: white !important;
              }
              body * {
                visibility: visible !important;
              }
              #print-engine-label-root {
                display: block !important;
                visibility: visible !important;
              }
            }
            
            body {
              margin: 0;
              padding: 0;
              background-color: white !important;
            }
          </style>
        </head>
        <body>
          <div id="print-engine-label-root"></div>
        </body>
      </html>
    `);
    iframeDoc.close();

    // 3. Inject styles from the main document (carefully)
    const head = iframeDoc.head;
    document.querySelectorAll('style, link[rel="stylesheet"]').forEach(style => {
      // Avoid duplicating fonts or re-injecting the reset we just wrote
      if (style.tagName === 'LINK' && (style as HTMLLinkElement).href.includes('fonts.googleapis.com')) return;
      head.appendChild(style.cloneNode(true));
    });

    // 4. Add specialized print styles that OVERRIDE everything with max priority
    const printStyles = document.createElement('style');
    printStyles.innerHTML = `
      #print-engine-label-root, #print-engine-label-root * {
        visibility: visible !important;
        opacity: 1 !important;
        box-sizing: border-box !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        color: #000000 !important;
        text-shadow: none !important;
      }
      
      .thermal-label {
        background-color: #ffffff !important;
        color: #000000 !important;
        display: flex !important;
        flex-direction: column !important;
        width: 100mm !important;
        height: 150mm !important;
        margin: 0 !important;
        padding: 6mm !important;
        -webkit-filter: contrast(1.2) !important;
        filter: contrast(1.2) !important;
      }

      #print-engine-label-root table { display: table !important; width: 100% !important; border-collapse: collapse !important; }
      #print-engine-label-root tr { display: table-row !important; }
      #print-engine-label-root td, #print-engine-label-root th { display: table-cell !important; }

      #print-engine-label-root svg, 
      #print-engine-label-root canvas, 
      #print-engine-label-root img {
        display: block !important;
        max-width: 100% !important;
        height: auto !important;
        margin: 0 auto !important;
        image-rendering: -webkit-optimize-contrast !important;
        image-rendering: crisp-edges !important;
      }
      
      #print-engine-label-root {
        width: 100mm !important;
        height: 150mm !important;
        margin: 0 !important;
        padding: 0 !important;
        background-color: white !important;
        overflow: hidden !important;
      }
      
      @page {
        size: 100mm 150mm;
        margin: 0;
      }
    `;
    head.appendChild(printStyles);

    // 5. Render component
    const container = iframeDoc.getElementById('print-engine-label-root');
    if (!container) {
      document.body.removeChild(iframe);
      resolve();
      return;
    }

    const root = createRoot(container);
    root.render(Component);

    // 6. Wait for content to load
    const checkReady = () => {
      const images = iframeDoc.getElementsByTagName('img');
      const imagePromises = Array.from(images).map(img => {
        if (img.complete) return Promise.resolve();
        return new Promise(resolveImg => {
          img.onload = resolveImg;
          img.onerror = resolveImg;
        });
      });

      Promise.all(imagePromises).then(() => {
        // Multi-frame delay to ensure React commits and browser paints
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
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
              }, 1200);
            }, 1000); // 1s safety margin
          });
        });
      });
    };

    // Initial delay to let React start rendering before checking images
    setTimeout(checkReady, 500);
  });
};
