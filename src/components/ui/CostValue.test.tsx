import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CostValue } from './CostValue';

describe('CostValue', () => {
  it('shows the amount in Indian words when hovered', () => {
    render(<CostValue amount={125_450} />);
    fireEvent.mouseEnter(screen.getByText('₹1,25,450.00'));

    expect(screen.getByRole('tooltip')).toHaveTextContent('one lakh twenty five thousand four hundred fifty rupees');
  });
});
