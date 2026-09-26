import { Body, Controller, Get, HttpCode, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { AppRequest, CurrentUser, RequirePermission, RequestUser, Scope, ScopeContext } from '../common/context.js';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { AssistantService } from './assistant.service.js';

/* Riwayat percakapan dikirim klien (tanpa status di server); dibatasi agar biaya & ukuran terkendali. */
const chatSchema = z.object({
  messages: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().trim().min(1).max(4000) })).min(1).max(20),
}).refine((b) => b.messages[0].role === 'user' && b.messages[b.messages.length - 1].role === 'user' && b.messages.every((m, i) => i === 0 || m.role !== b.messages[i - 1].role), {
  message: 'Percakapan harus bergantian pengguna/asisten, diawali dan diakhiri pesan pengguna.',
});

@Controller()
export class AssistantController {
  constructor(private readonly assistant: AssistantService) {}

  @Get('assistant/status') @RequirePermission('ledger.report.read')
  status() { return this.assistant.status(); }

  @Post('assistant/chat') @RequirePermission('ledger.report.read') @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  chat(@Body(new ZodValidationPipe(chatSchema)) b: z.infer<typeof chatSchema>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.assistant.chat(u, s, b.messages, { requestId: r.requestId, ip: r.ip, userAgent: r.headers['user-agent'] });
  }
}
