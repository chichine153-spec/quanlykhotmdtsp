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
    iframe.style.width = '0';
    iframe.style.height = '0';
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

    // 3. Inject styles from the main document to ensures consistent rendering
    const styles = document.querySelectorAll('style, link[rel="stylesheet"]');
    const head = iframeDoc.head;
    styles.forEach(style => {
      head.appendChild(style.cloneNode(true));
    });

    // 4. Add specialized print styles for thermal labels
    const printStyles = document.createElement('style');
    printStyles.innerHTML = `
      /* Force visibility in the hidden iframe so images/content can load */
      .print-only {
        display: block !important;
        visibility: visible !important;
        opacity: 1 !important;
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
      
      canvas, img, iframe {
        max-width: 100% !important;
        height: auto !important;
        display: block !important;
      }
      
      .thermal-label-container, .thermal-label {
        width: 100mm !important;
        height: 150mm !important;
        display: block !important;
        overflow: hidden !important;
      }
    `;
    head.appendChild(printStyles);

    // 5. Create container and render component
    const container = iframeDoc.createElement('div');
    container.className = 'print-only'; 
    iframeDoc.body.appendChild(container);

    const root = createRoot(container);
    root.render(Component);

    // 6. Wait for content to load (images, etc.)
    // We give it a generous delay to ensure React has finished rendering and images have loaded
    setTimeout(() => {
      // 7. Trigger print
      try {
        console.log('[PrintUtils] Triggering print for iframe');
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (err) {
        console.error('Print failed:', err);
      }
      
      // 8. Cleanup
      setTimeout(() => {
        document.body.removeChild(iframe);
        resolve();
      }, 500);
    }, 2000); // Wait 2s for PDF rendering/images
  });
};
