import { BadRequestException, Body, Controller, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { CalcInput, Calculation, CalculationService } from './calculation.service';

@Controller('cuts')
export class CuttingController {
  constructor(private readonly calc: CalculationService) {}

  @Post('calculate')
  async calculate(@Req() req: Request, @Body() body: CalcInput): Promise<Calculation> {
    try {
      return await this.calc.calculate(req.auth!.orgId, body);
    } catch (e) {
      if (e instanceof RangeError) throw new BadRequestException(e.message);
      throw e;
    }
  }
}
