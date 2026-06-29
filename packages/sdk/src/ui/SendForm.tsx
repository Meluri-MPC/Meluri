import { useState, FormEvent } from 'react';

export interface SendFormProps {
  onSend: (params: { recipient: string; amount: string; memo?: string; fee?: number }) => Promise<string>;
  isLoading?: boolean;
  error?: Error | null;
  txId?: string | null;
  className?: string;
}

const feeOptions = [
  { label: 'Slow', value: 1, description: '~10-30 min' },
  { label: 'Standard', value: 2, description: '~5-10 min' },
  { label: 'Fast', value: 5, description: '~1-2 min' },
];

export function SendForm({ onSend, isLoading = false, error, txId, className = '' }: SendFormProps) {
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [fee, setFee] = useState(2);
  const [localError, setLocalError] = useState<string | null>(null);

  const displayError = error?.message || localError;

  const validate = (): boolean => {
    if (!recipient.trim()) {
      setLocalError('Recipient address is required');
      return false;
    }
    if (!recipient.startsWith('SP') && !recipient.startsWith('ST')) {
      setLocalError('Invalid Stacks address');
      return false;
    }
    if (!amount || parseFloat(amount) <= 0) {
      setLocalError('Amount must be greater than 0');
      return false;
    }
    if (isNaN(parseFloat(amount))) {
      setLocalError('Invalid amount');
      return false;
    }
    setLocalError(null);
    return true;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    try {
      await onSend({
        recipient: recipient.trim(),
        amount,
        memo: memo.trim() || undefined,
        fee,
      });
      setRecipient('');
      setAmount('');
      setMemo('');
    } catch {
      // error handled by parent via the error prop
    }
  };

  if (txId) {
    return (
      <div className={`vx-send-form vx-send-form--success ${className}`} role="status">
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--vx-color-success)"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
        <p className="vx-send-form__success-text">Transaction sent!</p>
        <code className="vx-send-form__txid">{txId}</code>
      </div>
    );
  }

  return (
    <form
      className={`vx-send-form ${className}`}
      onSubmit={handleSubmit}
      noValidate
      aria-label="Send transaction"
    >
      <div className="vx-send-form__field">
        <label htmlFor="vx-recipient" className="vx-send-form__label">
          Recipient Address
        </label>
        <input
          id="vx-recipient"
          type="text"
          className="vx-send-form__input vx-focus-ring"
          placeholder="SP... or ST..."
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          aria-required="true"
          aria-invalid={localError && !recipient.trim() ? 'true' : undefined}
          autoComplete="off"
          spellCheck={false}
        />
      </div>

      <div className="vx-send-form__field">
        <label htmlFor="vx-amount" className="vx-send-form__label">
          Amount (STX)
        </label>
        <input
          id="vx-amount"
          type="text"
          inputMode="decimal"
          className="vx-send-form__input vx-focus-ring"
          placeholder="0.00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          aria-required="true"
          aria-invalid={localError && !amount.trim() ? 'true' : undefined}
          autoComplete="off"
        />
      </div>

      <div className="vx-send-form__field">
        <label htmlFor="vx-memo" className="vx-send-form__label">
          Memo <span className="vx-send-form__label-optional">(optional)</span>
        </label>
        <input
          id="vx-memo"
          type="text"
          className="vx-send-form__input vx-focus-ring"
          placeholder="Add a note..."
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          maxLength={34}
        />
      </div>

      <fieldset className="vx-send-form__field">
        <legend className="vx-send-form__label">Fee</legend>
        <div className="vx-send-form__fee-options" role="radiogroup" aria-label="Transaction fee">
          {feeOptions.map((option) => (
            <label
              key={option.value}
              className={`vx-send-form__fee-option ${fee === option.value ? 'vx-send-form__fee-option--selected' : ''}`}
            >
              <input
                type="radio"
                name="vx-fee"
                value={option.value}
                checked={fee === option.value}
                onChange={() => setFee(option.value)}
                className="vx-sr-only"
                aria-label={`${option.label}: ${option.description}`}
              />
              <span className="vx-send-form__fee-label">{option.label}</span>
              <span className="vx-send-form__fee-desc">{option.description}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {displayError && (
        <div className="vx-send-form__error" role="alert">
          {displayError}
        </div>
      )}

      <button
        type="submit"
        className="vx-send-form__submit vx-focus-ring vx-tap-target"
        disabled={isLoading}
        aria-busy={isLoading}
      >
        {isLoading ? (
          <>
            <span className="vx-spinner" aria-hidden="true" />
            Sending...
          </>
        ) : (
          'Send'
        )}
      </button>
    </form>
  );
}
