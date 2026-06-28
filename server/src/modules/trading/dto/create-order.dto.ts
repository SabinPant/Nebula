/**
 * CreateOrderDto
 *
 * Validates order placement payload before reaching the service layer.
 * All rules enforced here via class-validator — service receives only clean data.
 * All money values are in integer PAISE.
 */
import {
  IsInt,
  IsString,
  IsNotEmpty,
  IsIn,
  Min,
  Max,
  ValidateIf,
  IsDefined,
  Validate,
} from 'class-validator';
import {
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';
import { MARKET_CONSTANTS } from '../../../shared/constants/market.constants';

// Custom validator: MARKET orders must NOT include a price field.
@ValidatorConstraint({ name: 'isPriceValidForOrderStyle', async: false })
class IsPriceValidForOrderStyle implements ValidatorConstraintInterface {
  validate(price: unknown, args: ValidationArguments) {
    const dto = args.object as CreateOrderDto;
    if (dto.orderStyle === 'MARKET') {
      return price === undefined || price === null;
    }
    return true;
  }

  defaultMessage() {
    return 'Price must not be specified for MARKET orders';
  }
}

export class CreateOrderDto {
  @IsString()
  @IsNotEmpty({ message: 'Stock ID is required' })
  stockId!: string;

  @IsIn(['BUY', 'SELL'], { message: 'Order type must be BUY or SELL' })
  type!: 'BUY' | 'SELL';

  @IsIn(['MARKET', 'LIMIT'], { message: 'Order style must be MARKET or LIMIT' })
  orderStyle!: 'MARKET' | 'LIMIT';

  @IsInt({ message: 'Quantity must be a whole number' })
  @Min(1, { message: 'Quantity must be at least 1' })
  @Max(MARKET_CONSTANTS.ORDER_MAX_QUANTITY, {
    message: `Maximum ${MARKET_CONSTANTS.ORDER_MAX_QUANTITY.toLocaleString()} shares per order`,
  })
  quantity!: number;

  // Validate IF it's a LIMIT order, OR IF a price was illegally provided for a MARKET order.
  @ValidateIf((o: CreateOrderDto) => o.orderStyle === 'LIMIT' || o.price != null)
  @Validate(IsPriceValidForOrderStyle)
  @IsDefined({ message: 'Price is required for LIMIT orders' })
  @IsInt({ message: 'Price must be an integer in paise' })
  @Min(MARKET_CONSTANTS.ORDER_MIN_PRICE_PAISE, {
    message: 'Price must be at least 1 paise (Rs. 0.01)',
  })
  @Max(MARKET_CONSTANTS.ORDER_MAX_PRICE_PAISE, {
    message: `Price cannot exceed Rs. ${(MARKET_CONSTANTS.ORDER_MAX_PRICE_PAISE / 100).toLocaleString()}`,
  })
  price?: number;
}