/**
 * Encerrar a comanda exige motivo (ADR-021, invariante 8): sem texto o botão não confirma.
 */
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { V2ConfirmDialog } from '../screens/v2/shared/V2ConfirmDialog';

jest.mock('@okinawa/shared/contexts/ThemeContext', () => ({ useColors: () => new Proxy({}, { get: () => '#333333' }) }));

function Harness({ onConfirm, initial = '' }: { onConfirm: () => void; initial?: string }) {
  const [reason, setReason] = React.useState(initial);
  return (
    <V2ConfirmDialog
      visible
      title="Encerrar a comanda?"
      message="m"
      reasonLabel="Motivo"
      reason={reason}
      onReasonChange={setReason}
      onConfirm={onConfirm}
      onCancel={() => undefined}
    />
  );
}

describe('V2ConfirmDialog com motivo obrigatório', () => {
  it('não confirma sem motivo e confirma depois de digitar', () => {
    const onConfirm = jest.fn();
    const { getByTestId } = render(<Harness onConfirm={onConfirm} />);

    fireEvent.press(getByTestId('confirm-dialog-confirm'));
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.changeText(getByTestId('confirm-dialog-reason'), '   ');
    fireEvent.press(getByTestId('confirm-dialog-confirm'));
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.changeText(getByTestId('confirm-dialog-reason'), 'cliente pagou na maquininha');
    fireEvent.press(getByTestId('confirm-dialog-confirm'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('sem reasonLabel, o diálogo se comporta como antes', () => {
    const onConfirm = jest.fn();
    const { queryByTestId, getByTestId } = render(
      <V2ConfirmDialog visible title="t" message="m" onConfirm={onConfirm} onCancel={() => undefined} />,
    );
    expect(queryByTestId('confirm-dialog-reason')).toBeNull();
    fireEvent.press(getByTestId('confirm-dialog-confirm'));
    expect(onConfirm).toHaveBeenCalled();
  });
});
