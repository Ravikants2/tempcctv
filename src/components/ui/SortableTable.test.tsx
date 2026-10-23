import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SortableTable } from './SortableTable';

describe('SortableTable', () => {
  it('sorts text and numeric columns in both directions', () => {
    render(
      <SortableTable>
        <thead><tr><th>Name</th><th>Count</th></tr></thead>
        <tbody>
          <tr><td>Venue 10</td><td>2</td></tr>
          <tr><td>Venue 2</td><td>12</td></tr>
        </tbody>
      </SortableTable>
    );
    const table = screen.getByRole('table');
    const getNames = () => within(table).getAllByRole('row').slice(1).map(row => within(row).getAllByRole('cell')[0].textContent);

    fireEvent.click(screen.getByRole('button', { name: /Name/ }));
    expect(getNames()).toEqual(['Venue 2', 'Venue 10']);

    fireEvent.click(screen.getByRole('button', { name: /Count/ }));
    expect(getNames()).toEqual(['Venue 10', 'Venue 2']);
  });

  it('sorts numeric cells when table rows contain fragments', () => {
    render(
      <SortableTable>
        <thead><tr><th>Temporary CCTV Days</th><th>Venue</th></tr></thead>
        <tbody>
          {[12, 2, 5].map(days => (
            <tr key={days}>{<>
              <td><button>{days}</button><span aria-hidden="true">↓</span></td>
              <td>Venue {days}</td>
            </>}</tr>
          ))}
        </tbody>
      </SortableTable>
    );

    fireEvent.click(screen.getByRole('button', { name: /Temporary CCTV Days/ }));
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
    expect(rows.map(row => within(row).getAllByRole('cell')[0].textContent)).toEqual(['2↓', '5↓', '12↓']);
  });

  it('reports sort changes without reordering controlled rows', () => {
    const onSortChange = vi.fn();
    const { rerender } = render(
      <SortableTable sort={null} onSortChange={onSortChange}>
        <thead><tr><th>Days</th></tr></thead>
        <tbody><tr><td>12</td></tr><tr><td>2</td></tr></tbody>
      </SortableTable>
    );

    fireEvent.click(screen.getByRole('button', { name: /Days/ }));
    expect(onSortChange).toHaveBeenCalledWith({ column: 0, direction: 'asc' });
    expect(within(screen.getByRole('table')).getAllByRole('cell').map(cell => cell.textContent)).toEqual(['12', '2']);

    rerender(
      <SortableTable sort={{ column: 0, direction: 'asc' }} onSortChange={onSortChange}>
        <thead><tr><th>Days</th></tr></thead>
        <tbody><tr><td>2</td></tr><tr><td>12</td></tr></tbody>
      </SortableTable>
    );
    expect(within(screen.getByRole('table')).getAllByRole('cell').map(cell => cell.textContent)).toEqual(['2', '12']);
  });
});
