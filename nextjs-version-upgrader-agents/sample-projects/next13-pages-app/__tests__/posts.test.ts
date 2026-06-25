import { getPosts, findPost } from '../lib/posts';

describe('posts library', () => {
  it('returns all posts', () => {
    expect(getPosts()).toHaveLength(3);
  });

  it('finds a post by id', () => {
    expect(findPost(1)?.title).toBe('Hello World');
  });

  it('returns undefined for a missing post', () => {
    expect(findPost(999)).toBeUndefined();
  });
});
