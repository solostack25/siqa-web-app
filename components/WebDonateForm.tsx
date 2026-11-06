import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet, Alert } from 'react-native';
import { useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { Theme } from '../constants/theme';
import type { AppColors } from '../lib/theme';

import { STRIPE_PUBLISHABLE_KEY } from '../lib/stripeKey';
import { brandStyles } from '../lib/ds';
import { Button } from './ui';

// loadStripe is pure JS (no native dependency), safe to call lazily even
// though this file is only ever imported on the web platform.
const stripePromise = loadStripe(STRIPE_PUBLISHABLE_KEY);

type Props = {
  clientSecret: string;
  colors: AppColors;
  isDark: boolean;
  onSuccess: (paymentIntentId: string) => void;
  onCancel: () => void;
  confirmLabel?: string;
  /** gold for donations (default), primary for purchases. */
  confirmVariant?: 'gold' | 'primary';
};

function InnerCardForm({ clientSecret, colors: C, isDark, onSuccess, onCancel, confirmLabel = 'Confirm donation', confirmVariant = 'gold' }: Props) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);

  async function handleConfirm() {
    if (!stripe || !elements) return;
    const cardElement = elements.getElement(CardElement);
    if (!cardElement) return;

    setSubmitting(true);
    setCardError(null);

    const { paymentIntent, error } = await stripe.confirmCardPayment(clientSecret, {
      payment_method: { card: cardElement },
    });

    if (error) {
      setCardError(error.message ?? 'Payment could not be completed.');
      setSubmitting(false);
      return;
    }

    if (paymentIntent?.status === 'succeeded') {
      onSuccess(paymentIntent.id);
    } else {
      setCardError('Payment did not complete. Please try again.');
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.wrap}>
      <View style={[styles.cardBox, { borderColor: C.border, backgroundColor: C.surface }]}>
        <CardElement
          options={{
            style: {
              base: {
                fontSize: '16px',
                fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
                color: isDark ? '#EDF1F7' : '#111111',
                '::placeholder': { color: isDark ? '#7E89A3' : '#767676' },
              },
              invalid: { color: isDark ? '#F08B74' : '#B4412C' },
            },
          }}
        />
      </View>

      {cardError ? <Text style={styles.errorText}>{cardError}</Text> : null}

      <View style={styles.btnRow}>
        <Button label="Cancel" variant="secondary" onPress={onCancel} disabled={submitting} style={{ flex: 1 }} />
        <Button label={confirmLabel} variant={confirmVariant} onPress={handleConfirm} loading={submitting} disabled={!stripe} style={{ flex: 1.6 }} />
      </View>
    </View>
  );
}

export default function WebDonateForm(props: Props) {
  return (
    <Elements stripe={stripePromise}>
      <InnerCardForm {...props} />
    </Elements>
  );
}

const styles = StyleSheet.create(brandStyles({
  wrap: { marginTop: Theme.spacing.lg, marginHorizontal: 20 },
  cardBox: {
    borderWidth: 1,
    borderRadius: Theme.radius.md,
    padding: Theme.spacing.lg,
  },
  errorText: { color: '#D9755F', fontSize: Theme.fontSize.sm, marginTop: Theme.spacing.sm },
  btnRow: { flexDirection: 'row', gap: Theme.spacing.md, marginTop: Theme.spacing.lg },
  cancelBtn: { flex: 1, paddingVertical: Theme.spacing.md, alignItems: 'center', justifyContent: 'center' },
  cancelText: { fontSize: Theme.fontSize.base, fontWeight: Theme.fontWeight.medium },
  confirmBtn: {
    flex: 2,
    paddingVertical: Theme.spacing.md,
    borderRadius: Theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmText: { fontSize: Theme.fontSize.base, fontWeight: Theme.fontWeight.semibold, color: '#15120E' },
}));
