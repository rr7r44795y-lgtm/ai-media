import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule } from '@nestjs/config';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { SupabaseConfig } from 'src/config/supabase.config';

@Module({
  imports: [
    // 复用项目已有鉴权模块（与auth模块一致的JWT策略）
    PassportModule.register({ defaultStrategy: 'jwt' }),
    // 复用全局配置模块（读取.env环境变量）
    ConfigModule,
  ],
  controllers: [BillingController],
  providers: [
    // 计费核心服务
    BillingService,
    // 复用全局Supabase配置（无需新增文件）
    SupabaseConfig,
  ],
  exports: [
    // 导出供其他模块使用
    BillingService,
    PassportModule,
  ],
})
export class BillingModule {}