type CardProps = {
  title: string;
  body: string;
};

// Plain presentational component (no deprecated APIs) — used by the test suite
// so the baseline tests are stable regardless of Next.js version.
export default function Card({ title, body }: CardProps) {
  return (
    <article className="card">
      <h3>{title}</h3>
      <p>{body}</p>
    </article>
  );
}
