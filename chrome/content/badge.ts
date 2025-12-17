// Badge component that displays cash flow and injects into DOM
// Note: This is not a React component, it creates DOM elements directly

export interface BadgeProps {
  cashFlow: number | null;
  onClick: () => void;
  isLoading?: boolean;
  insufficientInfo?: boolean;
  nonInteractive?: boolean; // If true, badge won't be clickable (for cards to prevent event propagation)
}

export function createBadgeElement(props: BadgeProps): HTMLElement {
  const badge = document.createElement('div');
  badge.className = 'fmr-badge';
  
  // Base styles matching app branding (light theme)
  badge.style.cssText = `
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    margin-left: 10px;
    background: white;
    border: 1px solid #e5e5e5;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    position: relative;
    z-index: 1000;
    box-shadow: none !important;
  `;
  
  badge.addEventListener('mouseenter', () => {
    badge.style.borderColor = '#d4d4d4';
    badge.style.background = '#fafafa';
    badge.style.boxShadow = 'none';
  });
  
  badge.addEventListener('mouseleave', () => {
    badge.style.borderColor = '#e5e5e5';
    badge.style.background = 'white';
    badge.style.boxShadow = 'none';
  });
  
  if (props.nonInteractive) {
    // For cards, make badge non-interactive to prevent event propagation issues
    badge.style.pointerEvents = 'none';
    badge.style.cursor = 'default';
  } else {
    badge.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      props.onClick();
    });
  }
  
  // Create brand label element
  const brandLabel = document.createElement('span');
  brandLabel.textContent = 'fmr.fyi';
  brandLabel.style.cssText = `
    font-size: 10px;
    font-weight: 600;
    color: #737373;
    letter-spacing: 0.5px;
    margin-right: 2px;
  `;
  
  badge.appendChild(brandLabel);
  
  // Create separator
  const separator = document.createElement('span');
  separator.style.cssText = `
    width: 1px;
    height: 12px;
    background: #e5e5e5;
    margin: 0 2px;
  `;
  badge.appendChild(separator);
  
  // Create content container that we can update
  const contentContainer = document.createElement('span');
  badge.appendChild(contentContainer);
  
  // Function to update badge content
  const updateContent = (cashFlow: number | null, isLoading: boolean = false, insufficientInfo: boolean = false) => {
    contentContainer.innerHTML = '';
    
    if (insufficientInfo) {
      // Insufficient info placeholder
      const insufficientLabel = document.createElement('span');
      insufficientLabel.textContent = 'Insufficient info';
      insufficientLabel.style.cssText = 'color: #a3a3a3;';
      contentContainer.appendChild(insufficientLabel);
    } else if (isLoading) {
      // Loading skeleton
      const skeleton = document.createElement('span');
      skeleton.style.cssText = `
        display: inline-flex;
        align-items: center;
        gap: 4px;
      `;
      skeleton.innerHTML = `
        <span style="color: #737373; margin-right: 4px;">Cash Flow:</span>
        <span style="
          display: inline-block;
          width: 60px;
          height: 14px;
          background: linear-gradient(90deg, #e5e5e5 25%, #f5f5f5 50%, #e5e5e5 75%);
          background-size: 200% 100%;
          animation: shimmer 1.5s infinite;
          border-radius: 3px;
        "></span>
      `;
      contentContainer.appendChild(skeleton);
      
      // Add shimmer animation if not already added
      if (!document.getElementById('fmr-skeleton-style')) {
        const style = document.createElement('style');
        style.id = 'fmr-skeleton-style';
        style.textContent = `
          @keyframes shimmer {
            0% { background-position: -200% 0; }
            100% { background-position: 200% 0; }
          }
        `;
        document.head.appendChild(style);
      }
    } else if (cashFlow === null) {
      const naLabel = document.createElement('span');
      naLabel.innerHTML = '<span style="color: #737373; margin-right: 4px;">Cash Flow:</span> <span style="color: #a3a3a3;">N/A</span>';
      contentContainer.appendChild(naLabel);
    } else {
      const isPositive = cashFlow >= 0;
      const color = isPositive ? '#16a34a' : '#dc2626'; // Match app branding colors
      const sign = isPositive ? '+' : '-';
      const formatted = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(Math.abs(cashFlow));
      
      const cashFlowContainer = document.createElement('span');
      cashFlowContainer.innerHTML = `
        <span style="color: #737373; margin-right: 4px;">Cash Flow:</span>
        <span style="color: ${color}; font-weight: 700; font-size: 13px;">${sign}${formatted}</span>
        <span style="color: #a3a3a3; font-size: 11px; margin-left: 2px;">/mo</span>
      `;
      contentContainer.appendChild(cashFlowContainer);
    }
  };
  
  // Store update function on badge element for external updates
  (badge as any).updateContent = updateContent;
  
  // Initial render
  updateContent(props.cashFlow, props.isLoading, props.insufficientInfo);
  
  return badge;
}
