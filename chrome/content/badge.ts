// Badge component that displays cash flow and injects into DOM
// Note: This is not a React component, it creates DOM elements directly

export interface BadgeProps {
  cashFlow: number | null;
  onClick: () => void;
}

export function createBadgeElement(props: BadgeProps): HTMLElement {
  const badge = document.createElement('div');
  badge.className = 'fmr-badge';
  badge.style.cssText = `
    display: inline-flex;
    align-items: center;
    padding: 4px 8px;
    margin-left: 8px;
    background: #fafafa;
    border: 1px solid #e5e5e5;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 0.2s;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  `;
  
  badge.addEventListener('mouseenter', () => {
    badge.style.backgroundColor = '#f5f5f5';
  });
  
  badge.addEventListener('mouseleave', () => {
    badge.style.backgroundColor = '#fafafa';
  });
  
  badge.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    props.onClick();
  });
  
  if (props.cashFlow === null) {
    badge.textContent = 'Cash Flow: N/A';
    badge.style.color = '#737373';
  } else {
    const isPositive = props.cashFlow >= 0;
    const color = isPositive ? '#16a34a' : '#dc2626';
    const sign = isPositive ? '+' : '-';
    const formatted = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(Math.abs(props.cashFlow));

    badge.innerHTML = `
      <span style="color: #737373; margin-right: 4px;">Cash Flow:</span>
      <span style="color: ${color}; font-weight: 600;">${sign}${formatted}/mo</span>
    `;
  }
  
  return badge;
}
