export type Post = {
  id: number;
  title: string;
  excerpt: string;
};

const POSTS: Post[] = [
  { id: 1, title: 'Hello World', excerpt: 'The very first post.' },
  { id: 2, title: 'Upgrading Next.js', excerpt: 'How to move from 13 to 15.' },
  { id: 3, title: 'Pages Router lives on', excerpt: 'No App Router migration required.' },
];

export function getPosts(): Post[] {
  return POSTS;
}

export function findPost(id: number): Post | undefined {
  return POSTS.find((post) => post.id === id);
}
