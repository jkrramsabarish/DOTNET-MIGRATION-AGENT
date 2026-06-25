import { render, screen } from '@testing-library/react';
import Card from '../components/Card';

describe('Card', () => {
  it('renders the title and body', () => {
    render(<Card title="Test Title" body="Test body text" />);
    expect(screen.getByText('Test Title')).toBeInTheDocument();
    expect(screen.getByText('Test body text')).toBeInTheDocument();
  });

  it('renders the title as a heading', () => {
    render(<Card title="Heading Check" body="..." />);
    expect(
      screen.getByRole('heading', { name: 'Heading Check' })
    ).toBeInTheDocument();
  });
});
