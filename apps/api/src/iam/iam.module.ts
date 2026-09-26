import { Module } from '@nestjs/common';
import { IamController } from './iam.controller.js';
import { IamService } from './iam.service.js';
import { SettingsService } from './settings.service.js';

@Module({ controllers: [IamController], providers: [IamService, SettingsService] })
export class IamModule {}
