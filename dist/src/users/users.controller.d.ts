import { UsersService } from './users.service';
import { UpdateUserProfileDto } from './dto/user-profile.dto';
import { GetUsersQueryDto, UpdateUserDto } from './dto/admin-user.dto';
import { UpdateCurrentUserDto, DeleteAccountDto } from './dto/current-user.dto';
import { CurrentUserPayload } from '../auth/decorators/current-user.decorator';
export declare class UsersController {
    private readonly usersService;
    constructor(usersService: UsersService);
    getCurrentUser(user: CurrentUserPayload): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    updateCurrentUser(dto: UpdateCurrentUserDto, user: CurrentUserPayload): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    deleteCurrentUser(dto: DeleteAccountDto, user: CurrentUserPayload): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    getProfile(user: CurrentUserPayload): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    updateProfile(dto: UpdateUserProfileDto, user: CurrentUserPayload): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    getUsers(query: GetUsersQueryDto): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    getUserStats(): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    getUserById(userId: string): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    getUserDetail(userId: string): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    updateUser(userId: string, dto: UpdateUserDto): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    deleteUser(userId: string): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
}
