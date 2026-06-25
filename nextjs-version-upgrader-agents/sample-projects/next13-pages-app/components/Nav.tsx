import Link from 'next/link';

// DEPRECATED (for upgrade testing): pre-13 `next/link` wrapped a child `<a>`.
// Next 13 removed this requirement; `legacyBehavior` keeps the old form working
// (and lets the build prerender). The `new-link` codemod removes both the
// `legacyBehavior` prop and the redundant `<a>`.
export default function Nav() {
  return (
    <nav>
      <ul style={{ display: 'flex', gap: '1rem', listStyle: 'none' }}>
        <li>
          <Link href="/" legacyBehavior>
            <a>Home</a>
          </Link>
        </li>
        <li>
          <Link href="/about" legacyBehavior>
            <a>About</a>
          </Link>
        </li>
      </ul>
    </nav>
  );
}
