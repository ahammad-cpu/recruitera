import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { OwnerPickerPopover } from './OwnerPickerPopover';
import type { Profile } from '@/hooks/useUsersData';

const PROFILES: Profile[] = [
  { id: 'u1', email: 'a.hammad@icareer.ai', full_name: 'Amr Hammad', role: 'admin', role_id: null, team_id: null, job_title: null, active: true, quarterly_target_egp: null, avatar_url: null },
  { id: 'u2', email: 'mariam.samir@recruitera.ai', full_name: 'Mariam Samir', role: 'user', role_id: null, team_id: null, job_title: null, active: true, quarterly_target_egp: null, avatar_url: null },
  { id: 'u3', email: 'sayed.youssif@icareer.ai', full_name: 'Sayed Youssif', role: 'user', role_id: null, team_id: null, job_title: null, active: true, quarterly_target_egp: null, avatar_url: null },
];

describe('OwnerPickerPopover', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it('renders every profile + the Unassigned option', () => {
    render(<OwnerPickerPopover profiles={PROFILES} currentId={null} onSelect={() => {}} onClose={() => {}} />);
    expect(screen.getByText('Unassigned')).toBeInTheDocument();
    expect(screen.getByText('Amr Hammad')).toBeInTheDocument();
    expect(screen.getByText('Mariam Samir')).toBeInTheDocument();
    expect(screen.getByText('Sayed Youssif')).toBeInTheDocument();
  });

  it('marks the current owner as selected', () => {
    render(<OwnerPickerPopover profiles={PROFILES} currentId="u2" onSelect={() => {}} onClose={() => {}} />);
    const row = screen.getByText('Mariam Samir').closest('button')!;
    expect(row).toHaveAttribute('aria-selected', 'true');
    const other = screen.getByText('Amr Hammad').closest('button')!;
    expect(other).toHaveAttribute('aria-selected', 'false');
  });

  it('marks Unassigned as selected when currentId is null', () => {
    render(<OwnerPickerPopover profiles={PROFILES} currentId={null} onSelect={() => {}} onClose={() => {}} />);
    const row = screen.getByText('Unassigned').closest('button')!;
    expect(row).toHaveAttribute('aria-selected', 'true');
  });

  it('filters by full_name (case-insensitive)', () => {
    render(<OwnerPickerPopover profiles={PROFILES} currentId={null} onSelect={() => {}} onClose={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText('Search user…'), { target: { value: 'mariam' } });
    expect(screen.getByText('Mariam Samir')).toBeInTheDocument();
    expect(screen.queryByText('Amr Hammad')).not.toBeInTheDocument();
    expect(screen.queryByText('Sayed Youssif')).not.toBeInTheDocument();
  });

  it('filters by email', () => {
    render(<OwnerPickerPopover profiles={PROFILES} currentId={null} onSelect={() => {}} onClose={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText('Search user…'), { target: { value: 'youssif' } });
    expect(screen.getByText('Sayed Youssif')).toBeInTheDocument();
    expect(screen.queryByText('Amr Hammad')).not.toBeInTheDocument();
  });

  it('shows empty state when no match', () => {
    render(<OwnerPickerPopover profiles={PROFILES} currentId={null} onSelect={() => {}} onClose={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText('Search user…'), { target: { value: 'zzzzzz' } });
    expect(screen.getByText('No users match.')).toBeInTheDocument();
  });

  it('fires onSelect with the profile and closes on row click', () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(<OwnerPickerPopover profiles={PROFILES} currentId={null} onSelect={onSelect} onClose={onClose} />);
    fireEvent.click(screen.getByText('Amr Hammad'));
    expect(onSelect).toHaveBeenCalledWith(PROFILES[0]);
    expect(onClose).toHaveBeenCalled();
  });

  it('fires onSelect(null) when Unassigned clicked', () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(<OwnerPickerPopover profiles={PROFILES} currentId="u1" onSelect={onSelect} onClose={onClose} />);
    fireEvent.click(screen.getByText('Unassigned'));
    expect(onSelect).toHaveBeenCalledWith(null);
    expect(onClose).toHaveBeenCalled();
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(<OwnerPickerPopover profiles={PROFILES} currentId={null} onSelect={() => {}} onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('closes on outside click', () => {
    const onClose = vi.fn();
    render(
      <div>
        <div data-testid="outside">outside</div>
        <OwnerPickerPopover profiles={PROFILES} currentId={null} onSelect={() => {}} onClose={onClose} />
      </div>,
    );
    fireEvent.mouseDown(screen.getByTestId('outside'));
    expect(onClose).toHaveBeenCalled();
  });

  it('does NOT close when clicking inside the popover', () => {
    const onClose = vi.fn();
    render(<OwnerPickerPopover profiles={PROFILES} currentId={null} onSelect={() => {}} onClose={onClose} />);
    fireEvent.mouseDown(screen.getByPlaceholderText('Search user…'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('autofocuses the search input on mount', () => {
    render(<OwnerPickerPopover profiles={PROFILES} currentId={null} onSelect={() => {}} onClose={() => {}} />);
    expect(screen.getByPlaceholderText('Search user…')).toHaveFocus();
  });
});
