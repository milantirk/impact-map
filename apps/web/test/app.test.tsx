import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';

const gym = 'Hetente háromszor edzek az edzőteremben, mert túlsúlyos lettem egy sérülés miatt.';

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('impact-map/v1', JSON.stringify({ lang: 'hu' }));
  history.replaceState(null, '', '/');
});
afterEach(() => vi.restoreAllMocks());

async function typeDecision(text: string) {
  fireEvent.change(screen.getByRole('textbox', { name: 'Döntési modell' }), {
    target: { value: text },
  });
  await waitFor(() => expect(screen.getByText('Rendszeres testmozgás')).toBeInTheDocument());
}

describe('App', () => {
  it('shows an empty state first', () => {
    render(<App />);
    expect(screen.getByText(/Írj le egy döntést/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mentés és megosztás' })).toBeDisabled();
  });

  it('reads the decision, shows factors, precision, categories and the graph', async () => {
    const { container } = render(<App />);
    await typeDecision(gym);
    expect(screen.getByText('Edzőterem-bérlet')).toBeInTheDocument();
    expect(screen.getByText('Edzés sérülés után')).toBeInTheDocument();
    expect(screen.getByRole('meter', { name: 'Pontosság' })).toHaveAttribute('aria-valuenow');
    expect(screen.getByText('saját élet')).toBeInTheDocument();
    expect(container.querySelectorAll('g.node').length).toBeGreaterThan(10);
  });

  it('lets the user remove a factor and change its intensity', async () => {
    render(<App />);
    await typeDecision(gym);
    fireEvent.click(screen.getByRole('button', { name: 'Eltávolítás: Edzés sérülés után' }));
    expect(screen.queryByText('Edzés sérülés után')).not.toBeInTheDocument();
    const dots = screen.getByRole('button', { name: /Intenzitás.*Rendszeres testmozgás 75%/ });
    fireEvent.click(dots);
    expect(
      screen.getByRole('button', { name: /Intenzitás.*Rendszeres testmozgás 100%/ }),
    ).toBeInTheDocument();
  });

  it('shows the table with a change column when many people decide', async () => {
    render(<App />);
    await typeDecision(gym);
    fireEvent.click(screen.getByRole('tab', { name: 'táblázat' }));
    const table = screen.getByRole('table');
    expect(within(table).getByText('Egészségügyi')).toBeInTheDocument();
    expect(within(table).queryByText('Változás')).not.toBeInTheDocument();
    fireEvent.change(screen.getAllByRole('slider')[1]!, { target: { value: '5' } });
    expect(within(screen.getByRole('table')).getByText('Változás')).toBeInTheDocument();
    expect(screen.getAllByText(/100\s000 fő/).length).toBe(2);
  });

  it('changes the number of steps', async () => {
    const { container } = render(<App />);
    await typeDecision(gym);
    const before = container.querySelectorAll('g.node').length;
    fireEvent.change(screen.getAllByRole('slider')[0]!, { target: { value: '1' } });
    await waitFor(() => expect(container.querySelectorAll('g.node').length).toBeLessThan(before));
  });

  it('switches the language', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'language' }));
    expect(screen.getByRole('textbox', { name: 'Decision model' })).toBeInTheDocument();
  });

  it('saves and shares the decision', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: 'abcDEF1234', createdAt: '2026-10-21T10:00:00Z' }), {
        status: 201,
      }),
    );
    render(<App />);
    await typeDecision(gym);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Mentés és megosztás' }));
    });
    const body = JSON.parse(String(fetchMock.mock.calls[0]![1]!.body));
    expect(body).toMatchObject({
      text: gym,
      factors: null,
      settings: { steps: 3, people: 1, lang: 'hu' },
    });
    expect(location.search).toBe('?d=abcDEF1234');
    expect(screen.getByRole('status', { name: '' })).toHaveTextContent('A link a vágólapon.');
  });

  it('loads a shared decision from the link', async () => {
    history.replaceState(null, '', '/?d=abcDEF1234');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'abcDEF1234',
          text: gym,
          factors: [{ id: 'regular_exercise', intensity: 1 }],
          settings: { steps: 2, people: 1000, windowDays: 30, durationDays: null, lang: 'hu' },
          modelVersion: '1.0.0',
          createdAt: '2026-10-21T10:00:00Z',
        }),
        { status: 200 },
      ),
    );
    render(<App />);
    await waitFor(() => expect(screen.getByText('Rendszeres testmozgás')).toBeInTheDocument());
    expect(screen.queryByText('Edzőterem-bérlet')).not.toBeInTheDocument();
    expect(screen.getAllByText(/1\s?000 fő/).length).toBe(2);
  });
});
