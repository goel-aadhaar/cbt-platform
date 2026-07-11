import { ConflictException, Injectable } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import { CreateInstituteDto } from './dto/create-institute.dto';

@Injectable()
export class InstitutesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateInstituteDto) {
    const existing = await this.prisma.institute.findUnique({
      where: { slug: dto.slug },
    });
    if (existing) {
      throw new ConflictException(
        `Institute slug '${dto.slug}' is already taken`,
      );
    }
    return this.prisma.institute.create({
      data: { name: dto.name, slug: dto.slug },
      select: {
        id: true,
        name: true,
        slug: true,
        isActive: true,
        createdAt: true,
      },
    });
  }
}
