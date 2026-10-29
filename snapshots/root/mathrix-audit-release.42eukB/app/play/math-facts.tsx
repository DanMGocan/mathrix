"use client";
import { useEffect, useState } from "react";

const facts = [
  [
    "A perfect little number",
    "6 is a perfect number: its positive divisors smaller than itself, 1, 2 and 3, add up to 6.",
  ],
  [
    "A shortcut to 5,050",
    "Pair 1 with 100, 2 with 99, and so on. The 50 pairs each total 101, so 1 + 2 + … + 100 = 5,050.",
  ],
  [
    "Never-ending primes",
    "There are infinitely many prime numbers. No matter how far you count, there is always another one.",
  ],
  [
    "The empty arrangement",
    "0! equals 1. There is exactly one way to arrange zero objects: the empty arrangement.",
  ],
  [
    "Odd numbers make squares",
    "Adding the first n positive odd numbers gives n². For example, 1 + 3 + 5 + 7 = 16.",
  ],
  [
    "A famous sequence",
    "Start with 0 and 1, then add the previous two numbers: 0, 1, 1, 2, 3, 5, 8, 13… This is the Fibonacci sequence.",
  ],
  [
    "A circle's constant",
    "For every circle in the Euclidean plane, circumference divided by diameter equals π.",
  ],
  ["The power of a zero", "Any nonzero number raised to the power 0 equals 1."],
  [
    "A quick check for nine",
    "A whole number is divisible by 9 exactly when the sum of its digits is divisible by 9.",
  ],
  [
    "Triangles add up",
    "In the Euclidean plane, the three interior angles of a triangle add up to 180 degrees.",
  ],
  [
    "A very special 28",
    "28 is another perfect number: 1 + 2 + 4 + 7 + 14 = 28.",
  ],
  [
    "One even prime",
    "2 is the only even prime number. Every larger positive even number has 2 as a divisor.",
  ],
];

export default function MathFacts() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) return;
    const timer = setInterval(
      () => setIndex((i) => (i + 1) % facts.length),
      8000,
    );
    return () => clearInterval(timer);
  }, [paused]);
  return (
    <article className="math-fact" aria-label="Math fun facts">
      <small>
        A LITTLE MATH WHILE YOU WAIT · {index + 1}/{facts.length}
      </small>
      <h2>{facts[index][0]}</h2>
      <p>{facts[index][1]}</p>
      <div className="actions">
        <button onClick={() => setIndex((i) => (i + 1) % facts.length)}>
          Next fact
        </button>
        <button onClick={() => setPaused(!paused)} aria-pressed={paused}>
          {paused ? "Resume cards" : "Pause cards"}
        </button>
      </div>
    </article>
  );
}
