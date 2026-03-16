import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const jwtSecret = process.env.JWT_SECRET?.trim();
  if (!jwtSecret) {
    throw new Error('JWT_SECRET is required');
  }

  const app = await NestFactory.create(AppModule, {
    cors: {
      origin: process.env.CORS_ORIGIN?.split(',').map((origin) => origin.trim()).filter(Boolean) || false,
      credentials: true,
    },
  });

  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const port = Number(process.env.PORT) || 3001;
  await app.listen(port, '0.0.0.0');
}

bootstrap();
