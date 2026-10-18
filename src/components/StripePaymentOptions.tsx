import { useId } from 'react';

export type StripePaymentMethod = 'card' | 'crypto';

export default function StripePaymentOptions({ value, onChange, disabled = false }: {
  value: StripePaymentMethod;
  onChange: (method: StripePaymentMethod) => void;
  disabled?: boolean;
}) {
  const name = useId();
  return (
    <fieldset className="stripe-payment-options" disabled={disabled}>
      <legend>Payment method</legend>
      <div className="stripe-payment-choices">
        <label className={value === 'card' ? 'selected' : ''}>
          <input type="radio" name={name} value="card" checked={value === 'card'} onChange={() => onChange('card')} />
          <span>Card</span>
        </label>
        <label className={value === 'crypto' ? 'selected' : ''}>
          <input type="radio" name={name} value="crypto" checked={value === 'crypto'} onChange={() => onChange('crypto')} />
          <span>USDC</span>
        </label>
      </div>
      <p className="field-hint">{value === 'crypto' ? 'Pay from your wallet through Stripe. The creator must have USDC enabled.' : 'Pay securely through Stripe.'}</p>
    </fieldset>
  );
}
