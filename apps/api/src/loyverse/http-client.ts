import axios from 'axios';
import type { AxiosInstance } from 'axios';

/**
 * Minimal HTTP port for the Loyverse boundary. Injected so tests use a fake
 * and never perform real network calls. Failures surface as thrown errors
 * (axios-shaped) which LoyversePosGateway translates into typed errors.
 */
export interface HttpClient {
  post<T>(path: string, body: unknown): Promise<T>;
  get<T>(path: string, params?: Record<string, string | number>): Promise<T>;
}

export class AxiosLoyverseHttpClient implements HttpClient {
  private readonly client: AxiosInstance;

  constructor(baseUrl: string, token: string, timeoutMs: number) {
    this.client = axios.create({
      baseURL: baseUrl,
      timeout: timeoutMs,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const response = await this.client.post<T>(path, body);
    return response.data;
  }

  async get<T>(path: string, params?: Record<string, string | number>): Promise<T> {
    const response = await this.client.get<T>(path, { params });
    return response.data;
  }
}
