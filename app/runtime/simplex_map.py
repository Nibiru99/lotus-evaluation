def coefficients(d, xp):
    k = xp.arange(1, d+1, dtype=xp.float64)
    return xp.sqrt((d+1)/d)/xp.sqrt(k*(k+1))

def dense(d):
    weights = coefficients(d, np)
    result = np.zeros((d+1, d), dtype=np.float64)
    for k in range(1, d+1):
        result[:k, k-1] = weights[k-1]
        result[k, k-1] = -k*weights[k-1]
    return result

def axis_apply(x, weights, axis, xp, inverse=False):
    moved = xp.moveaxis(x, axis, 0)
    d = len(weights); shape = (d,)+(1,)*(moved.ndim-1)
    k = xp.arange(1, d+1, dtype=xp.float64).reshape(shape)
    if inverse:
        result = weights.reshape(shape)*(xp.cumsum(moved, axis=0)[:-1]-k*moved[1:])/((d+1)/d)
    else:
        a = moved*weights.reshape(shape)
        suffix = xp.flip(xp.cumsum(xp.flip(a, axis=0), axis=0), axis=0)
        result = xp.concatenate([suffix, xp.zeros((1,)+moved.shape[1:], dtype=xp.float64)], axis=0)
        result[1:] -= k*a
    return xp.moveaxis(result, 0, axis)

def implicit(x, dims, weights, xp, inverse=False):
    value = x.reshape(tuple(d+1 if inverse else d for d in dims)+(x.shape[-1],))
    order = reversed(range(len(dims))) if inverse else range(len(dims))
    for axis in order:
        value = axis_apply(value, weights[axis], axis, xp, inverse)
    return value.reshape((-1, x.shape[-1]))
