/**
 * Helper function to sleep for a specified number of milliseconds
 */
export const sleep = async (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
