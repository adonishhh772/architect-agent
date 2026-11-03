export async function mapWithConcurrency<Item, Result>(
  items: readonly Item[],
  limit: number,
  mapper: (item: Item) => Promise<Result>,
): Promise<Result[]> {
  const results: Result[] = new Array(items.length);
  let nextIndex = 0;
  const workerCount = Math.max(1, Math.min(limit, items.length));

  async function runWorker(): Promise<void> {
    const index = nextIndex;
    nextIndex += 1;
    if (index >= items.length) {
      return;
    }
    results[index] = await mapper(items[index] as Item);
    await runWorker();
  }

  const workers: Array<Promise<void>> = [];
  for (let workerIndex = 0; workerIndex < workerCount; workerIndex += 1) {
    workers.push(runWorker());
  }
  await Promise.all(workers);
  return results;
}
