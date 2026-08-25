import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class ContactMessageDto {
  @ApiProperty({ example: 'Priya Nair' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @ApiProperty({ example: 'priya@example.com' })
  @IsEmail()
  @MaxLength(200)
  email: string;

  @ApiPropertyOptional({ example: 'Sunrise Academy' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  organization?: string;

  @ApiProperty({
    example: "We'd like to see a demo of the CBT platform for our institute.",
  })
  @IsString()
  @MinLength(10)
  @MaxLength(4000)
  message: string;
}
