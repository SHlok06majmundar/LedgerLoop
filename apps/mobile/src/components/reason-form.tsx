import { useState } from 'react';
import { View } from 'react-native';
import { Body, Button, Card, Input, Label } from './ui';

/**
 * Inline "why?" step for a destructive action. Alert.prompt only exists on
 * iOS, so the reason is typed into the screen instead.
 */
export function ReasonForm({
  title,
  hint,
  action,
  loading,
  onSubmit,
  onCancel,
}: {
  title: string;
  hint: string;
  action: string;
  loading?: boolean;
  onSubmit: (reason: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState('');
  const valid = reason.trim().length >= 3;
  return (
    <Card style={{ gap: 12 }}>
      <Body bold>{title}</Body>
      <Label>{hint}</Label>
      <Input label="Reason" value={reason} onChangeText={setReason} placeholder="At least 3 characters" autoFocus multiline />
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Button title="Cancel" variant="outline" onPress={onCancel} disabled={loading} />
        </View>
        <View style={{ flex: 1 }}>
          <Button title={action} variant="danger" onPress={() => onSubmit(reason.trim())} loading={loading} disabled={!valid} />
        </View>
      </View>
    </Card>
  );
}
