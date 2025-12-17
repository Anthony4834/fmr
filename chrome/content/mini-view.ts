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
}

export function createMiniViewElement(props: MiniViewProps): HTMLElement {
  const container = document.createElement('div');
  container.className = 'fmr-mini-view';

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
    z-index: 10000;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  `;

  // Create header with close button
  const header = document.createElement('div');
  header.style.cssText = `
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid #e5e5e5;
    background: #fafafa;
  `;

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
