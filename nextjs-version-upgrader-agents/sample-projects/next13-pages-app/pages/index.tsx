import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import Hero from '../components/Hero';
import Nav from '../components/Nav';
import Card from '../components/Card';
import { getPosts, type Post } from '../lib/posts';

type HomeProps = {
  posts: Post[];
};

export default function Home({ posts }: HomeProps) {
  return (
    <>
      <Head>
        <title>Next 13 Sample App</title>
        <meta name="description" content="Sample app for upgrade testing" />
      </Head>
      <Nav />
      <Hero title="Welcome to the Sample App" />
      <section>
        <h2>Latest posts</h2>
        {posts.map((post) => (
          <Card key={post.id} title={post.title} body={post.excerpt} />
        ))}
      </section>
    </>
  );
}

// Pages Router data fetching — this STAYS on Pages Router (not migrated to App Router).
export const getServerSideProps: GetServerSideProps<HomeProps> = async () => {
  return {
    props: {
      posts: getPosts(),
    },
  };
};
