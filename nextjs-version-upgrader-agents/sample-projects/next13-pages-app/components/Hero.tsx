import Image from 'next/image';

type HeroProps = {
  title: string;
};

// DEPRECATED (for upgrade testing): the legacy `next/image` API used
// `layout` and `objectFit` props. The modern `next/image` (Next 13+) removes
// these. The `next-image-experimental` codemod handles the import/props, but
// `layout="fill"` usage typically leaves manual sizing work for the LLM
// Transformer (a "partial" codemod result).
export default function Hero({ title }: HeroProps) {
  return (
    <section style={{ position: 'relative', width: '100%', height: 400 }}>
      <Image
        src="https://images.unsplash.com/photo-1506744038136-46273834b3fb"
        alt="Scenic hero background"
        layout="fill"
        objectFit="cover"
      />
      <h1 style={{ position: 'relative', color: 'white' }}>{title}</h1>
    </section>
  );
}
