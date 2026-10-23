import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppData, User } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { buildChatContext, sendChatMessage } from '../../utils/chat';
import ChatPage, { AssistantAnswer } from './ChatPage';

vi.mock('../../context/AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('../../utils/chat', () => ({
  buildChatContext: vi.fn(() => ({ summary: '{}', records: [], requirements: [], vendors: [], installations: [], examDates: [] })),
  sendChatMessage: vi.fn(),
}));

const data: AppData = {
  users: [],
  requirements: [],
  vendors: [],
  installations: [],
  examDates: [],
  quotations: [],
  quoteRevisions: [],
  approvalEvents: [],
  blanketApprovals: [],
  accessRoles: [],
  userGroups: [],
  auditLogs: [],
};

describe('AssistantAnswer', () => {
  it('renders Markdown tables as accessible, scrollable tables', () => {
    render(<AssistantAnswer text={'| Zone | Installations |\n| --- | ---: |\n| North | 3 |'} />);

    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Zone' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'North' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '3' })).toBeInTheDocument();
  });
});

describe('ChatPage', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    vi.mocked(useAuth).mockReturnValue({
      currentUser: {
        id: 'user-1', name: 'Test User', email: 'test@example.com',
        role: 'user',
      } satisfies User,
      data,
      syncStatus: 'idle',
      syncError: '',
      isGitHub: false,
      login: vi.fn(async () => false),
      logout: vi.fn(async () => undefined),
      createUserAccount: vi.fn(async user => user),
      changeUserPassword: vi.fn(async () => undefined),
      updateData: vi.fn(),
      addAuditLog: vi.fn(),
      can: vi.fn(() => true),
      reloadFromGitHub: vi.fn(),
    });
    vi.mocked(sendChatMessage).mockReset();
    vi.mocked(sendChatMessage)
      .mockResolvedValueOnce('There are two installations.')
      .mockResolvedValueOnce('North has one installation.');
    vi.mocked(buildChatContext).mockClear();
  });

  it('sends with Enter, supports follow-up context, and keeps Shift+Enter for new lines', async () => {
    render(<ChatPage />);
    const composer = screen.getByRole('textbox', { name: 'Your question' });

    fireEvent.change(composer, { target: { value: 'How many installations?' } });
    fireEvent.keyDown(composer, { key: 'Enter', shiftKey: true });
    expect(sendChatMessage).not.toHaveBeenCalled();

    fireEvent.keyDown(composer, { key: 'Enter' });
    await screen.findByText('There are two installations.');
    expect(sendChatMessage).toHaveBeenNthCalledWith(
      1,
      'How many installations?',
      { summary: '{}', records: [], requirements: [], vendors: [], installations: [], examDates: [] },
      []
    );

    fireEvent.change(composer, { target: { value: 'What about North?' } });
    fireEvent.keyDown(composer, { key: 'Enter' });
    await screen.findByText('North has one installation.');
    await waitFor(() => expect(sendChatMessage).toHaveBeenNthCalledWith(
      2,
      'What about North?',
      { summary: '{}', records: [], requirements: [], vendors: [], installations: [], examDates: [] },
      [
        { role: 'user', text: 'How many installations?' },
        { role: 'model', text: 'There are two installations.' },
      ]
    ));
  });

  it('does not show the removed demo warning or Gemini typing text', () => {
    render(<ChatPage />);

    expect(screen.queryByText(/Demo mode:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Gemini is checking the current data/)).not.toBeInTheDocument();
    expect(screen.getByText(/Shift\+Enter for a new line/)).toBeInTheDocument();
  });
});
