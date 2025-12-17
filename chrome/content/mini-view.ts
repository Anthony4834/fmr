// Mini results view component that displays the main app's ZIP page in an iframe
// Note: This is not a React component, it creates DOM elements directly

import { ExtensionPreferences } from '../shared/types';

export interface MiniViewProps {
  address: string;
  zipCode: string;
  preferences: ExtensionPreferences;
  purchasePrice: number | null;
  bedrooms: number | null;
  onClose: () => void;
  overlay?: HTMLElement; // Overlay element to hide/show during dragging
}

export function createMiniViewElement(props: MiniViewProps): HTMLElement {
  const container = document.createElement('div');
  container.className = 'fmr-mini-view';

  // Calculate initial position (centered)
  const initialTop = window.innerHeight / 2;
  const initialLeft = window.innerWidth / 2;
  let currentTop = initialTop;
  let currentLeft = initialLeft;
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragStartLeft = 0;
  let dragStartTop = 0;
  let dragJustEnded = false; // Track if drag just ended to prevent accidental close

  // Style the container
  container.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 90%;
    max-width: 1000px;
    height: 85vh;
    background: white;
    border-radius: 8px;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
    z-index: 10011;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    user-select: none;
  `;

  // Create header first (needed by drag handlers)
  const header = document.createElement('div');
  header.style.cssText = `
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid #e5e5e5;
    background: #fafafa;
    cursor: grab;
    user-select: none;
    position: relative;
  `;

  // Create grab handle indicator (dots in 2x3 grid)
  const grabHandle = document.createElement('div');
  grabHandle.style.cssText = `
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-right: 12px;
    opacity: 0.4;
    pointer-events: none;
  `;
  
  // Create 2 rows of 3 dots each
  const row1 = document.createElement('div');
  row1.style.cssText = `display: flex; gap: 4px;`;
  const row2 = document.createElement('div');
  row2.style.cssText = `display: flex; gap: 4px;`;
  
  for (let i = 0; i < 3; i++) {
    const dot1 = document.createElement('div');
    dot1.style.cssText = `width: 4px; height: 4px; background: #737373; border-radius: 50%;`;
    row1.appendChild(dot1);
    
    const dot2 = document.createElement('div');
    dot2.style.cssText = `width: 4px; height: 4px; background: #737373; border-radius: 50%;`;
    row2.appendChild(dot2);
  }
  
  grabHandle.appendChild(row1);
  grabHandle.appendChild(row2);
  
  // Add hover effect to grab handle
  header.addEventListener('mouseenter', () => {
    grabHandle.style.opacity = '0.6';
  });
  
  header.addEventListener('mouseleave', () => {
    grabHandle.style.opacity = '0.4';
  });

  // Update position function
  const updatePosition = (clientX: number, clientY: number) => {
    const deltaX = clientX - dragStartX;
    const deltaY = clientY - dragStartY;
    
    currentLeft = dragStartLeft + deltaX;
    currentTop = dragStartTop + deltaY;
    
    // Constrain to viewport bounds
    const rect = container.getBoundingClientRect();
    const maxLeft = window.innerWidth - rect.width;
    const minLeft = 0;
    const maxTop = window.innerHeight - rect.height;
    const minTop = 0;
    
    currentLeft = Math.max(minLeft, Math.min(maxLeft, currentLeft));
    currentTop = Math.max(minTop, Math.min(maxTop, currentTop));
    
    container.style.left = `${currentLeft}px`;
    container.style.top = `${currentTop}px`;
  };

  // Drag handlers
  const handleMouseDown = (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) {
      return; // Don't drag if clicking the close button
    }
    
    isDragging = true;
    const rect = container.getBoundingClientRect();
    
    // Store the initial mouse position and container position
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragStartLeft = rect.left;
    dragStartTop = rect.top;
    
    header.style.cursor = 'grabbing';
    // Remove transform and set explicit position
    container.style.transform = 'none';
    container.style.transition = 'none';
    container.style.left = `${rect.left}px`;
    container.style.top = `${rect.top}px`;
    
    // Hide overlay background and disable iframe interactions during drag
    if (props.overlay) {
      props.overlay.style.background = 'transparent';
      props.overlay.style.pointerEvents = 'none';
    }
    
    // Prevent iframe from receiving pointer events during drag
    const iframe = container.querySelector('iframe');
    if (iframe) {
      (iframe as any).__fmrOriginalPointerEvents = iframe.style.pointerEvents || '';
      iframe.style.pointerEvents = 'none';
    }
    
    e.preventDefault();
    e.stopPropagation();
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging) return;
    updatePosition(e.clientX, e.clientY);
  };

  const handleMouseUp = () => {
    if (!isDragging) return;
    isDragging = false;
    dragJustEnded = true;
    header.style.cursor = 'grab';
    container.style.transition = '';
    
    // Show overlay background again and restore iframe interactions
    if (props.overlay) {
      props.overlay.style.background = 'rgba(0, 0, 0, 0.5)';
      // Store flag on overlay so click handler can check it
      (props.overlay as any).__fmrDragJustEnded = true;
      // Delay restoring pointer events and clearing flag to prevent accidental close
      setTimeout(() => {
        if (props.overlay) {
          props.overlay.style.pointerEvents = 'auto';
          (props.overlay as any).__fmrDragJustEnded = false;
        }
        dragJustEnded = false;
      }, 150);
    } else {
      dragJustEnded = false;
    }
    
    // Restore iframe pointer events
    const iframe = container.querySelector('iframe');
    if (iframe && (iframe as any).__fmrOriginalPointerEvents !== undefined) {
      iframe.style.pointerEvents = (iframe as any).__fmrOriginalPointerEvents;
      delete (iframe as any).__fmrOriginalPointerEvents;
    }
  };

  // Make header draggable
  header.addEventListener('mousedown', handleMouseDown);
  
  // Global mouse move/up handlers
  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', handleMouseUp);
  
  // Cleanup on close
  const originalOnClose = props.onClose;
  props.onClose = () => {
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
    originalOnClose();
  };

  const title = document.createElement('div');
  title.textContent = `ZIP ${props.zipCode} - FMR Analysis`;
  title.style.cssText = `
    font-size: 16px;
    font-weight: 600;
    color: #0a0a0a;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  `;

  const closeBtn = document.createElement('button');
  closeBtn.textContent = '×';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.style.cssText = `
    background: none;
    border: none;
    font-size: 32px;
    line-height: 1;
    color: #737373;
    cursor: pointer;
    padding: 0;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    transition: background-color 0.2s;
  `;

  closeBtn.addEventListener('mouseenter', () => {
    closeBtn.style.backgroundColor = '#e5e5e5';
  });

  closeBtn.addEventListener('mouseleave', () => {
    closeBtn.style.backgroundColor = 'transparent';
  });

  closeBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    props.onClose();
  });

  header.appendChild(grabHandle);
  header.appendChild(title);
  header.appendChild(closeBtn);

  // Create iframe with config passed as URL parameter
  const iframe = document.createElement('iframe');

  // Build config object to pass to main app
  const config = {
    downPaymentPercent: props.preferences.downPaymentPercent,
    insuranceMonthly: props.preferences.insuranceMonthly,
    hoaMonthly: props.preferences.hoaMonthly,
    propertyManagementMode: props.preferences.propertyManagementMode,
    propertyManagementPercent: props.preferences.propertyManagementPercent,
    propertyManagementAmount: props.preferences.propertyManagementAmount,
    overrideTaxRate: props.preferences.overrideTaxRate,
    overrideMortgageRate: props.preferences.overrideMortgageRate,
    propertyTaxRateAnnualPct: props.preferences.propertyTaxRateAnnualPct,
    mortgageRateAnnualPct: props.preferences.mortgageRateAnnualPct,
    customLineItems: props.preferences.customLineItems || [],
    purchasePrice: props.purchasePrice,
    bedrooms: props.bedrooms,
  };

  // Serialize config to base64 to avoid URL encoding issues
  const configJson = JSON.stringify(config);
  const configBase64 = btoa(configJson);

  iframe.src = `https://fmr.fyi/zip/${props.zipCode}?config=${encodeURIComponent(configBase64)}`;
  iframe.style.cssText = `
    flex: 1;
    border: none;
    width: 100%;
    height: 100%;
  `;
  iframe.setAttribute('loading', 'eager');

  container.appendChild(header);
  container.appendChild(iframe);

  return container;
}
