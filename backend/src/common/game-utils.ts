const CHAR_POOL = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'A', 'B', 'C', 'D', 'E', 'F'];

export function getPool(n: number): string[] {
  return CHAR_POOL.slice(0, n);
}

export function validateSequence(input: string, n: number, m: number): string {
  const value = input.trim().toUpperCase();
  if (n < 9 || n > 15 || m < 3 || m > n) {
    throw new Error('N 或 M 超出范围');
  }
  if (value.length !== m) {
    throw new Error(`序列长度必须为 ${m}`);
  }
  const pool = new Set(getPool(n));
  const chars = value.split('');
  if (new Set(chars).size !== chars.length) {
    throw new Error('序列字符不能重复');
  }
  if (!chars.every((char) => pool.has(char))) {
    throw new Error('序列包含非法字符');
  }
  return value;
}

export function evaluateGuess(secret: string, guess: string) {
  const secretChars = secret.split('');
  const guessChars = guess.split('');
  const hitPosCount = guessChars.filter((char, index) => secretChars[index] === char).length;
  const hitCharCount = guessChars.filter((char) => secretChars.includes(char)).length;

  return {
    hitCharCount,
    hitPosCount,
  };
}
