import Head from 'next/head';
import Nav from '../components/Nav';
import Card from '../components/Card';

export default function About() {
  return (
    <>
      <Head>
        <title>About</title>
      </Head>
      <Nav />
      <main>
        <h1>About</h1>
        <Card
          title="What is this?"
          body="A deliberately outdated Next.js 13 app used to test the upgrade agents."
        />
      </main>
    </>
  );
}
