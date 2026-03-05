import http from 'k6/http';
import { check, sleep } from 'k6';

// This K6 script simulates a spike in traffic to test the Circuit Breaker
export const options = {
  stages: [
    { duration: '10s', target: 50 },  // Ramp up to 50 users
    { duration: '20s', target: 50 },  // Stay at 50 users
    { duration: '10s', target: 0 },   // Ramp down
  ],
};

export default function () {
  const payload = JSON.stringify({
    amount: 1500,
    currency: 'USD',
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
    },
  };

  const res = http.post('http://localhost:3000/api/v1/payments', payload, params);

  // We expect 503s when the Circuit Breaker is OPEN
  check(res, {
    'is status 200 or 503 (Circuit Breaker active)': (r) => r.status === 200 || r.status === 503,
  });

  sleep(0.1);
}