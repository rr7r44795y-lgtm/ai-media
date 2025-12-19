/**
 * 内容模块核心配置
 * 路径：src/modules/content/content.module.ts
 * 使用 Supabase 作为数据层，与 AuthModule 风格统一
 */
import { Module } from '@nestjs/common';

// 导入 Supabase 配置（全局已注册，但显式导入确保类型提示）
import { SupabaseConfig } from 'src/config/supabase.config';

// 本模块核心组件
import { ContentController } from './content.controller';
import { ContentService } from './content.service';

@Module({
  imports: [
    // 无需额外导入，SupabaseConfig 已全局可用
  ],
  controllers: [ContentController],
  providers: [
    ContentService,
    // SupabaseConfig 已全局注入，这里无需重复注册
  ],
  exports: [
    ContentService, // 供其他模块调用内容逻辑
  ],
})
export class ContentModule {}