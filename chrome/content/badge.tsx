// Badge component that displays cash flow and injects into DOM
// Note: This is not a React component, it creates DOM elements directly

export interface BadgeProps {
  cashFlow: number | null;
  onClick: () => void;
}

export function createBadgeElement(props: BadgeProps): HTMLElement {
  const badge = document.createElement('div');
  badge.className = 'fmr-badge';
  
  // Base styles with branded design that stands out from the page
  badge.style.cssText = `
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    margin-left: 10px;
    background: linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%);
    border: 1.5px solid #3a3a3a;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(255, 255, 255, 0.05) inset;
    position: relative;
    z-index: 1000;
  `;
  
  badge.addEventListener('mouseenter', () => {
    badge.style.transform = 'translateY(-1px)';
    badge.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.2), 0 0 0 1px rgba(255, 255, 255, 0.1) inset';
    badge.style.borderColor = '#4a4a4a';
  });
  
  badge.addEventListener('mouseleave', () => {
    badge.style.transform = 'translateY(0)';
    badge.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(255, 255, 255, 0.05) inset';
    badge.style.borderColor = '#3a3a3a';
  });
  
  badge.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    props.onClick();
  });
  
  // Create brand label element
  const brandLabel = document.createElement('span');
  brandLabel.textContent = 'FMR.fyi';
  brandLabel.style.cssText = `
    font-size: 10px;
    font-weight: 600;
    color: #ffffff;
    opacity: 0.7;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    margin-right: 2px;
  `;
  
  badge.appendChild(brandLabel);
  
  // Create separator
  const separator = document.createElement('span');
  separator.style.cssText = `
    width: 1px;
    height: 12px;
    background: rgba(255, 255, 255, 0.15);
    margin: 0 2px;
  `;
  badge.appendChild(separator);
  
  if (props.cashFlow === null) {
    const naLabel = document.createElement('span');
    naLabel.innerHTML = '<span style="color: rgba(255, 255, 255, 0.6);">Cash Flow:</span> <span style="color: rgba(255, 255, 255, 0.5);">N/A</span>';
    badge.appendChild(naLabel);
  } else {
    const isPositive = props.cashFlow >= 0;
    const color = isPositive ? '#4ade80' : '#f87171'; // Brighter colors for dark background
    const sign = isPositive ? '+' : '';
    const formatted = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(Math.abs(props.cashFlow));
    
    const cashFlowContainer = document.createElement('span');
    cashFlowContainer.innerHTML = `
      <span style="color: rgba(255, 255, 255, 0.7); margin-right: 4px;">Cash Flow:</span>
      <span style="color: ${color}; font-weight: 700; font-size: 13px;">${sign}${formatted}</span>
      <span style="color: rgba(255, 255, 255, 0.5); font-size: 11px; margin-left: 2px;">/mo</span>
    `;
    badge.appendChild(cashFlowContainer);
  }
  
  return badge;
}
