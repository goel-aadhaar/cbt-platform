import {
  type ArgumentMetadata,
  BadRequestException,
  ValidationPipe,
} from '@nestjs/common';

import { CreateQuestionDto } from './create-question.dto';
import { UpdateQuestionDto } from './update-question.dto';

/** Same options as the global pipe in app.module.ts. */
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
});

const UUID = '3b241101-e2bb-4255-8caf-4136c566a962';
const KEY = `${UUID}/3b241101-e2bb-4255-8caf-4136c566a963.png`;

function body(options: unknown[]) {
  return {
    subjectId: UUID,
    chapterId: UUID,
    difficulty: 'EASY',
    type: 'MCQ',
    statement: 'Pick one',
    options,
    answerKey: 'A',
  };
}

async function errorsFor(
  metatype: ArgumentMetadata['metatype'],
  value: unknown,
): Promise<string[]> {
  try {
    await pipe.transform(value, { type: 'body', metatype });
  } catch (err) {
    expect(err).toBeInstanceOf(BadRequestException);
    return ((err as BadRequestException).getResponse() as { message: string[] })
      .message;
  }
  return [];
}

describe('question option DTO: text or image', () => {
  it('accepts a text-only option', async () => {
    expect(
      await errorsFor(
        CreateQuestionDto,
        body([
          { key: 'A', text: 'one' },
          { key: 'B', text: 'two' },
        ]),
      ),
    ).toEqual([]);
  });

  it('accepts an image-only option with empty text', async () => {
    expect(
      await errorsFor(
        CreateQuestionDto,
        body([
          { key: 'A', text: '', mediaKey: KEY },
          { key: 'B', text: 'two' },
        ]),
      ),
    ).toEqual([]);
  });

  it('rejects an option with neither text nor image', async () => {
    const errors = await errorsFor(
      CreateQuestionDto,
      body([
        { key: 'A', text: '   ' },
        { key: 'B', text: 'two' },
      ]),
    );
    expect(errors.join()).toContain('Each option needs text or an image');
  });

  it('still requires the text property itself', async () => {
    const errors = await errorsFor(
      CreateQuestionDto,
      body([
        { key: 'A', mediaKey: KEY },
        { key: 'B', text: 'two' },
      ]),
    );
    expect(errors.join()).toContain('text must be a string');
  });

  it('rejects a malformed or oversized mediaKey', async () => {
    const bad = await errorsFor(
      CreateQuestionDto,
      body([
        { key: 'A', text: 'x', mediaKey: 'has space/../x' },
        { key: 'B', text: 'two' },
      ]),
    );
    expect(bad.join()).toContain('mediaKey is not a valid media key');

    const long = await errorsFor(
      CreateQuestionDto,
      body([
        { key: 'A', text: 'x', mediaKey: 'a'.repeat(201) },
        { key: 'B', text: 'two' },
      ]),
    );
    expect(long.join()).toContain('mediaKey must be shorter');
  });

  it('keeps rejecting unknown option fields (no file names, alt text)', async () => {
    const errors = await errorsFor(
      CreateQuestionDto,
      body([
        { key: 'A', text: 'x', fileName: 'answer-B.png' },
        { key: 'B', text: 'two' },
      ]),
    );
    expect(errors.join()).toContain('should not exist');
  });

  it('applies to an update too', async () => {
    const errors = await errorsFor(UpdateQuestionDto, {
      options: [
        { key: 'A', text: '' },
        { key: 'B', text: 'two' },
      ],
    });
    expect(errors.join()).toContain('Each option needs text or an image');
  });
});
