export type JobSearchFilters = {
  vehicleType?: string;
  minPrice?: number;
  maxPrice?: number;
  search?: string;
};

export function buildJobFilters(filters: JobSearchFilters) {
  const where: any = {
    status: "open",
  };

  if (filters.vehicleType) {
    where.vehicleType = filters.vehicleType;
  }

  if (
    filters.minPrice !== undefined &&
    Number.isFinite(filters.minPrice)
  ) {
    where.price = {
      ...(where.price || {}),
      gte: filters.minPrice,
    };
  }

  if (
    filters.maxPrice !== undefined &&
    Number.isFinite(filters.maxPrice)
  ) {
    where.price = {
      ...(where.price || {}),
      lte: filters.maxPrice,
    };
  }

  const search = filters.search?.trim();

  if (search) {
    where.OR = [
      {
        pickup: {
          contains: search,
          mode: "insensitive",
        },
      },
      {
        dropoff: {
          contains: search,
          mode: "insensitive",
        },
      },
      {
        vehicleType: {
          contains: search,
          mode: "insensitive",
        },
      },
      {
        notes: {
          contains: search,
          mode: "insensitive",
        },
      },
    ];
  }

  return where;
}