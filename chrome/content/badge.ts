// fmr.fyi badge with brand-left, circle indicator, separator, and NO "Cash Flow" label

export interface BadgeProps {
  cashFlow: number | null;
  onClick: () => void;
  isLoading?: boolean;
  insufficientInfo?: boolean;
  nonInteractive?: boolean;
  hoaUnavailable?: boolean;
  mode?: 'cashFlow' | 'fmr';
  fmrMonthly?: number | null;
}

export function createBadgeElement(props: BadgeProps): HTMLElement {
  const badge = document.createElement('div');
  badge.className = 'fmr-badge';

  const badgeZIndex = props.hoaUnavailable ? '10010' : '1000';
  const setModeDataset = (mode: 'cashFlow' | 'fmr') => {
    try {
      badge.dataset.fmrMode = mode;
    } catch {
      // ignore
    }
  };

  // Match the reference style (flat, crisp border, small radius, no heavy shadow)
  // Use !important to prevent parent element font-size from affecting badge (detail views often have larger h1 fonts)
  badge.style.cssText = `
    display: inline-flex;
    align-items: center;
    gap: 6px;

    background: #ffffff;
    border: 1px solid rgba(229, 229, 229, 1);
    border-radius: 6px;

    font-size: 12px !important;
    font-weight: 500;
    line-height: 1;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;

    position: relative;
    z-index: ${badgeZIndex};

    box-sizing: border-box;
    width: fit-content;
    max-width: max-content;
    flex: 0 0 auto;
    white-space: nowrap;

    box-shadow: none !important;
    transition: 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  `;

  badge.addEventListener('mouseenter', () => {
    badge.style.borderColor = 'rgba(212, 212, 212, 1)';
    badge.style.background = 'rgba(250, 250, 250, 1)';
  });

  badge.addEventListener('mouseleave', () => {
    badge.style.borderColor = 'rgba(229, 229, 229, 1)';
    badge.style.background = '#ffffff';
  });

  // Click behavior
  if (props.nonInteractive) {
    badge.style.cursor = 'default';
    if (props.hoaUnavailable) {
      badge.style.pointerEvents = 'auto';
      badge.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
    } else {
      badge.style.pointerEvents = 'none';
    }
  } else {
    badge.style.cursor = 'pointer';
    badge.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      props.onClick();
    });
  }

  // Content container
  const content = document.createElement('span');
  content.style.cssText = `
    display: inline-flex;
    align-items: center;
    gap: 6px;
  `;
  badge.appendChild(content);

  // Brand (subtle, like reference)
  const brand = document.createElement('span');
  brand.textContent = 'fmr.fyi';
  brand.style.cssText = `
    font-size: 10px !important;
    font-weight: 600;
    color: rgba(115, 115, 115, 1);
    letter-spacing: 0.5px;
    margin-right: 2px;
  `;
  content.appendChild(brand);

  // Dot indicator (subtle border)
  const dot = document.createElement('span');
  dot.style.cssText = `
    width: 7px;
    height: 7px;
    border-radius: 999px;
    background: rgba(163, 163, 163, 1);
    box-shadow: inset 0 0 0 1px rgba(212, 212, 212, 1);
    flex-shrink: 0;
    margin-right: 2px;
  `;
  content.appendChild(dot);

  // Separator
  const sep = document.createElement('span');
  sep.setAttribute('aria-hidden', 'true');
  sep.style.cssText = `
    width: 1px;
    height: 12px;
    background: rgba(229, 229, 229, 1);
    margin: 0 2px;
    flex-shrink: 0;
  `;
  content.appendChild(sep);

  // Value container
  const valueWrap = document.createElement('span');
  valueWrap.style.cssText = `
    display: inline-flex;
    align-items: baseline;
    gap: 4px;
    font-variant-numeric: tabular-nums;
  `;
  content.appendChild(valueWrap);

  function ensureShimmerStyle() {
    if (document.getElementById('fmr-skeleton-style')) return;
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

  function buildInfoTooltipIcon(): HTMLElement {
    const icon = document.createElement('span');
    icon.className = 'fmr-tip-icon';
    icon.textContent = '?';
    icon.style.cssText = `
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 16px;
      height: 16px;

      border-radius: 6px;
      background: rgba(250, 250, 250, 1);
      border: 1px solid rgba(229, 229, 229, 1);

      color: rgba(115, 115, 115, 1);
      font-size: 11px;
      font-weight: 700;

      cursor: help;
      line-height: 1;
      position: relative;
      flex-shrink: 0;
    `;

    const tip = document.createElement('div');
    tip.textContent =
      'HOA dues aren’t available in list/map view. This assumes $0 HOA. Expand property details to see calculation with HOA.';
    tip.style.cssText = `
      position: absolute;
      bottom: calc(100% + 10px);
      left: 50%;
      transform: translateX(-50%);

      width: 280px;
      padding: 10px 12px;

      background: rgba(10,10,10,0.97);
      color: rgba(255,255,255,0.96);

      font-size: 11.5px;
      line-height: 1.35;
      font-weight: 500;

      border: 1px solid rgba(38,38,38,1);
      border-radius: 10px;

      opacity: 0;
      pointer-events: none;
      transition: opacity 0.12s ease;

      box-shadow: 0 18px 50px rgba(0,0,0,0.30);
      z-index: 10011;
      white-space: normal;
    `;

    icon.addEventListener('mouseenter', () => (tip.style.opacity = '1'));
    icon.addEventListener('mouseleave', () => (tip.style.opacity = '0'));
    icon.appendChild(tip);
    return icon;
  }

  const updateContent = (
    cashFlow: number | null,
    isLoading = false,
    insufficientInfo = false,
    hoaUnavailable = false
  ) => {
    setModeDataset('cashFlow');
    // z-index / pointer-events if tooltip should be shown
    if (hoaUnavailable) {
      badge.style.zIndex = '10010';
      if (props.nonInteractive) badge.style.pointerEvents = 'auto';
    } else {
      badge.style.zIndex = '1000';
      if (props.nonInteractive) badge.style.pointerEvents = 'none';
    }

    valueWrap.textContent = '';
    const existingTip = content.querySelector('.fmr-tip-icon');
    if (existingTip) existingTip.remove();

    if (insufficientInfo) {
      dot.style.background = 'rgba(163, 163, 163, 1)';

      const t = document.createElement('span');
      t.textContent = 'Insufficient data';
      t.style.cssText = `
        color: rgba(115, 115, 115, 1);
        font-weight: 600;
        font-size: 12px !important;
      `;
      valueWrap.appendChild(t);
      return;
    }

    if (isLoading) {
      ensureShimmerStyle();
      dot.style.background = 'rgba(163, 163, 163, 1)';

      const skeleton = document.createElement('span');
      skeleton.style.cssText = `
        display: inline-block;
        width: 56px;
        height: 12px;
        border-radius: 4px;
        background: linear-gradient(
          90deg,
          rgba(229,229,229,1) 25%,
          rgba(245,245,245,1) 50%,
          rgba(229,229,229,1) 75%
        );
        background-size: 200% 100%;
        animation: shimmer 1.1s infinite;
      `;
      valueWrap.appendChild(skeleton);
      return;
    }

    if (cashFlow === null) {
      dot.style.background = 'rgba(163, 163, 163, 1)';

      const t = document.createElement('span');
      t.textContent = 'Insufficient data';
      t.style.cssText = `
        color: rgba(115, 115, 115, 1);
        font-weight: 600;
        font-size: 12px !important;
      `;
      valueWrap.appendChild(t);
      return;
    }

    const isPositive = cashFlow >= 0;

    // Keep your existing app accents
    const dotColor = isPositive ? 'rgba(22, 163, 74, 1)' : 'rgba(225, 29, 72, 1)';
    dot.style.background = dotColor;

    const sign = isPositive ? '+' : '-';
    const formatted = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(Math.abs(cashFlow));

    const value = document.createElement('span');
    value.textContent = `${sign}${formatted}`;
    value.style.cssText = `
      color: ${dotColor};
      font-weight: 700;
      font-size: 13px !important;
    `;

    const per = document.createElement('span');
    per.textContent = '/mo';
    per.style.cssText = `
      color: rgba(163, 163, 163, 1);
      font-size: 11px !important;
      margin-left: 2px;
    `;

    valueWrap.appendChild(value);
    valueWrap.appendChild(per);

    if (hoaUnavailable) {
      content.appendChild(buildInfoTooltipIcon());
    }
  };

  const updateFmrContent = (
    fmrMonthly: number | null,
    isLoading = false,
    insufficientInfo = false,
    hoaUnavailable = false
  ) => {
    setModeDataset('fmr');

    // In FMR-only mode we never show the HOA tooltip, so keep normal z-index.
    badge.style.zIndex = '1000';
    if (props.nonInteractive) {
      // Respect non-interactive setting for Zillow card propagation safety
      badge.style.pointerEvents = hoaUnavailable ? 'auto' : 'none';
    }

    valueWrap.textContent = '';
    const existingTip = content.querySelector('.fmr-tip-icon');
    if (existingTip) existingTip.remove();

    if (insufficientInfo) {
      dot.style.background = 'rgba(163, 163, 163, 1)';

      const t = document.createElement('span');
      t.textContent = 'Insufficient data';
      t.style.cssText = `
        color: rgba(115, 115, 115, 1);
        font-weight: 600;
        font-size: 12px !important;
      `;
      valueWrap.appendChild(t);
      return;
    }

    if (isLoading) {
      ensureShimmerStyle();
      dot.style.background = 'rgba(163, 163, 163, 1)';

      const skeleton = document.createElement('span');
      skeleton.style.cssText = `
        display: inline-block;
        width: 56px;
        height: 12px;
        border-radius: 4px;
        background: linear-gradient(
          90deg,
          rgba(229,229,229,1) 25%,
          rgba(245,245,245,1) 50%,
          rgba(229,229,229,1) 75%
        );
        background-size: 200% 100%;
        animation: shimmer 1.1s infinite;
      `;
      valueWrap.appendChild(skeleton);
      return;
    }

    if (fmrMonthly === null) {
      dot.style.background = 'rgba(163, 163, 163, 1)';

      const t = document.createElement('span');
      t.textContent = 'Insufficient data';
      t.style.cssText = `
        color: rgba(115, 115, 115, 1);
        font-weight: 600;
        font-size: 12px !important;
      `;
      valueWrap.appendChild(t);
      return;
    }

    const dotColor = 'rgba(59, 130, 246, 1)'; // blue accent for FMR-only mode
    dot.style.background = dotColor;

    const formatted = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(Math.abs(fmrMonthly));

    const value = document.createElement('span');
    value.textContent = `${formatted}`;
    value.style.cssText = `
      color: ${dotColor};
      font-weight: 700;
      font-size: 13px !important;
    `;

    const per = document.createElement('span');
    per.textContent = '/mo';
    per.style.cssText = `
      color: rgba(163, 163, 163, 1);
      font-size: 11px !important;
      margin-left: 2px;
    `;

    valueWrap.appendChild(value);
    valueWrap.appendChild(per);
  };

  (badge as any).updateContent = updateContent;
  (badge as any).updateFmrContent = updateFmrContent;

  // Initialize based on desired mode (default: cash flow)
  if (props.mode === 'fmr') {
    updateFmrContent(props.fmrMonthly ?? null, props.isLoading, props.insufficientInfo, props.hoaUnavailable);
  } else {
    updateContent(props.cashFlow, props.isLoading, props.insufficientInfo, props.hoaUnavailable);
  }

  return badge;
}
